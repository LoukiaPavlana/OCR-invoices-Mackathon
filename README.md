Designed and implemented a three-agent pipeline to extract, classify, and query structured financial data from invoice and receipt images sourced from Kaggle and user uploads.
* Agent 1 ingested raw PNG invoice and receipt images, applied VLM-based extraction using Claude Haiku 4.5, and stored processed outputs in both AWS S3 and an OpenSearch vector database.
* Agent 2 read the extracted JSON from S3, classified documents as invoices or receipts, and wrote structured records into a PostgreSQL RDS relational database for quantitative querying.
* Agent 3 served as the conversational interface, differentiating between semantic questions (answered via vector search) and mathematical questions (answered via SQL queries on the relational database), and generated appropriate charts when numerical results were returned.
* Built a full-stack web UI, featuring a document upload page connected to the live pipeline and a chatbot interface with conversation history for querying financial data in natural language.
Supported real-time document ingestion through the UI, allowing users to upload new invoices and receipts directly into the same pipeline used for the Kaggle dataset.
