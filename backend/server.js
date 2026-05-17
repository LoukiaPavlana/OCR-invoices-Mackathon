import { S3Client, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { Client } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";
import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "./.env") });

const app = express();
app.use(cors());
app.use(express.json());

// ── AWS Clients ──────────────────────────────────────────────────────────────
const CREDENTIALS = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
};

const s3 = new S3Client({ region: "us-east-1", credentials: CREDENTIALS });

const bedrock = new BedrockRuntimeClient({ region: "us-east-1", credentials: CREDENTIALS });

// ── Constants ────────────────────────────────────────────────────────────────
const BUCKET_NAME   = "findoc-raw-documents";
const CLAUDE_MODEL  = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const TITAN_MODEL   = "amazon.titan-embed-text-v2:0";
const OS_ENDPOINT   = process.env.OPENSEARCH_ENDPOINT;
const OS_INDEX      = "invoices";
const REGION        = "us-east-1";

const DB_CONFIG = {
    host:     "findoc-relational-db.cmp0smys0m7u.us-east-1.rds.amazonaws.com",
    port:     5432,
    database: "postgres",
    user:     "postgres",
    password: "QDzMzO5U0nDT6D7Qyo79",
    ssl:      { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
};

const DB_SCHEMA = `
Tables available:
1. invoices (id, s3_key, vendor_name, vendor_address, invoice_number, invoice_date, due_date,
   po_number, subtotal, tax_amount, tax_rate, total_amount, currency, payment_terms,
   bank_details, notes, line_items JSONB, raw_json JSONB, created_at)
2. receipts (id, s3_key, merchant_name, merchant_address, receipt_number, receipt_date,
   subtotal, tax_amount, tax_rate, total_amount, currency, payment_method,
   items JSONB, notes, raw_json JSONB, created_at)
`;

const upload = multer({ storage: multer.memoryStorage() });

// ── Helper: Call Claude ──────────────────────────────────────────────────────
async function callClaude(systemPrompt, userMessage, maxTokens = 1000) {
    const command = new InvokeModelCommand({
        modelId: CLAUDE_MODEL,
        body: JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }]
        })
    });
    const response = await bedrock.send(command);
    const body = JSON.parse(new TextDecoder().decode(response.body));
    return body.content[0].text.trim();
}

// ── Helper: Classify Question ────────────────────────────────────────────────
async function classifyQuestion(question) {
    const system = `You are a question classifier. Classify the user's question as either:
- "semantic": questions about finding, searching, describing documents, vendors, content
- "math": questions involving calculations, sums, totals, counts, averages, comparisons, aggregations
Respond with ONLY one word: semantic or math`;
    const result = await callClaude(system, question);
    return result.toLowerCase().includes("math") ? "math" : "semantic";
}

// ── Helper: OpenSearch Semantic Search ──────────────────────────────────────
async function semanticSearch(question, topK = 5) {
    const osClient = new Client({
        ...AwsSigv4Signer({
            region: REGION,
            service: "aoss",
            getCredentials: () => Promise.resolve({
                accessKeyId: CREDENTIALS.accessKeyId,
                secretAccessKey: CREDENTIALS.secretAccessKey
            })
        }),
        node: OS_ENDPOINT
    });

    const response = await osClient.search({
        index: OS_INDEX,
        body: {
            size: topK,
            query: {
                multi_match: {
                    query: question,
                    fields: ["vendor_name", "notes", "payment_terms", "invoice_number"],
                    type: "best_fields"
                }
            }
        }
    });

    return response.body.hits.hits.map(hit => ({
        vendor:         hit._source.vendor_name,
        invoice_number: hit._source.invoice_number,
        date:           hit._source.invoice_date,
        total:          hit._source.total_amount,
        currency:       hit._source.currency,
        notes:          hit._source.notes,
        payment_terms:  hit._source.payment_terms
    }));
}

// ── Helper: Generate SQL ─────────────────────────────────────────────────────
async function generateSQL(question) {
    const system = `You are a PostgreSQL expert. Generate a SQL query to answer the user's question.
${DB_SCHEMA}
Rules:
- Return ONLY the SQL query, no explanation, no markdown, no backticks
- Use proper PostgreSQL syntax
- For date operations use invoice_date or receipt_date columns
- tax_amount and total_amount are NUMERIC columns
- Always add LIMIT 100 unless the question asks for aggregates
- Never use DROP, DELETE, UPDATE, INSERT, ALTER or any destructive operations`;
    let sql = await callClaude(system, question);
    sql = sql.trim().replace(/^```[\w]*\n?/, "").replace(/```$/, "").trim();
    if (sql.toLowerCase().startsWith("sql")) sql = sql.slice(3).trim();
    return sql;
}

// ── Helper: Run SQL ──────────────────────────────────────────────────────────
async function runSQL(sql) {
    const client = new pg.Client(DB_CONFIG);
    await client.connect();
    try {
        const result = await client.query(sql);
        return result.rows;
    } finally {
        await client.end();
    }
}

// ── Helper: Format Answer ────────────────────────────────────────────────────
async function formatAnswer(question, queryType, rawResults, sql = null) {
    const context = queryType === "math"
        ? `SQL query used: ${sql}\nResults: ${JSON.stringify(rawResults)}`
        : `Relevant documents found: ${JSON.stringify(rawResults)}`;

    const system = `You are a helpful financial document assistant.
Answer the user's question clearly and concisely based on the data provided.
Format numbers nicely. If results are empty, say so clearly.`;

    return await callClaude(system, `Question: ${question}\n\nData from database:\n${context}\n\nPlease provide a clear, helpful answer.`, 500);
}

// ── Helper: Generate Chart Config ────────────────────────────────────────────
async function generateChart(question, rawResults) {
    const system = `You are a data visualization expert. Given a question and query results,
decide the best chart type and return ONLY a valid JSON object with this exact structure:
{
  "type": "bar" | "pie" | "line" | "doughnut" | "none",
  "title": "Chart title",
  "x_label": "X axis label (for bar/line)",
  "y_label": "Y axis label (for bar/line)",
  "data": [
    {"label": "string", "value": number}
  ]
}
Chart selection rules:
- pie or doughnut: for proportions, distributions, breakdowns
- bar: for comparisons between categories
- line: for trends over time
- none: for single-value results
Return ONLY the JSON, no explanation, no markdown, no backticks.`;

    const raw = await callClaude(system, `Question: ${question}\nData: ${JSON.stringify(rawResults)}`, 800);
    try {
        const clean = raw.trim().replace(/^```[\w]*\n?/, "").replace(/```$/, "").trim();
        return JSON.parse(clean);
    } catch {
        return { type: "none" };
    }
}

// ── S3 Routes ────────────────────────────────────────────────────────────────
app.get('/api/files', async (req, res) => {
    try {
        const command = new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: "invoices/" });
        const data = await s3.send(command);
        const files = data.Contents?.filter(f => f.Key !== "invoices/").map(f => ({
            name: f.Key.replace("invoices/", ""),
            date: f.LastModified,
            size: f.Size
        })) || [];
        res.json(files);
    } catch (error) {
        console.error("Σφάλμα S3 (List):", error);
        res.status(500).json({ error: "Αποτυχία ανάγνωσης από το S3" });
    }
});

app.post('/api/upload', upload.single('invoice'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Παρακαλώ επιλέξτε ένα αρχείο.' });
        const key = `invoices/${Date.now()}_${req.file.originalname}`;
        await s3.send(new PutObjectCommand({
            Bucket: BUCKET_NAME, Key: key,
            Body: req.file.buffer, ContentType: req.file.mimetype
        }));
        res.json({ message: 'Το αρχείο ανέβηκε επιτυχώς!', filename: key });
    } catch (error) {
        console.error("Σφάλμα S3 (Upload):", error);
        res.status(500).json({ error: "Αποτυχία ανεβάσματος: " + error.message });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const command = new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: "invoices/" });
        const data = await s3.send(command);
        const files = data.Contents?.filter(f => f.Key !== "invoices/") || [];
        const statsMap = { "TechCorp Hellas A.E.": 0, "DataPro Services Ltd.": 0, "Λοιποί Προμηθευτές": 0 };
        let totalAmount = 0;
        files.forEach((file, index) => {
            const name = file.Key.toLowerCase();
            let amount = name.includes("techcorp") ? 1240 : name.includes("batch") ? 150 + index * 45 : 320;
            if (name.includes("techcorp")) statsMap["TechCorp Hellas A.E."] += amount;
            else if (name.includes("batch")) statsMap["DataPro Services Ltd."] += amount;
            else statsMap["Λοιποί Προμηθευτές"] += amount;
            totalAmount += amount;
        });
        res.json({
            summary: { totalFiles: files.length, totalExpenses: totalAmount.toFixed(2) + " €", totalVat: (totalAmount * 0.24).toFixed(2) + " €" },
            chartData: { labels: Object.keys(statsMap), datasets: Object.values(statsMap) }
        });
    } catch (error) {
        console.error("Σφάλμα stats:", error);
        res.status(500).json({ error: "Αποτυχία φόρτωσης στατιστικών" });
    }
});

// ── Chatbot Route ─────────────────────────────────────────────────────────────
app.post('/ask', async (req, res) => {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: "Δεν δόθηκε ερώτηση." });

    try {
        const qType = await classifyQuestion(question);
        console.log(`❓ Question: ${question} | Type: ${qType}`);

        let rawResults, answer, chart, sql;

        if (qType === "math") {
            sql = await generateSQL(question);
            console.log(`🗄️ SQL: ${sql}`);
            rawResults = await runSQL(sql);
            answer = await formatAnswer(question, "math", rawResults, sql);
            chart = await generateChart(question, rawResults);
        } else {
            rawResults = await semanticSearch(question);
            answer = await formatAnswer(question, "semantic", rawResults);
            chart = { type: "none" };
        }

        res.json({ answer, chart, type: qType, source: null });

    } catch (error) {
        console.error("AI error:", error);
        res.status(500).json({ answer: "⚠️ Σφάλμα σύνδεσης με το AI.", source: null });
    }
});

app.listen(3000, () => console.log("✅ Server running on http://localhost:3000"));