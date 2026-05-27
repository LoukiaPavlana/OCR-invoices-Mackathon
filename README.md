# FinDoc AI - Multi-Agent Financial Document Understanding System

FinDoc AI is a cloud-based AI system designed to extract, classify, structure, and query financial data from invoice and receipt images. The project was developed during the UniAi Makeathon, which took first place in the group semi finals, and focuses on combining Visual Language Models, vector search, relational databases and conversational AI to support both semantic and quantitative financial document analysis.

The system processes invoice and receipt images sourced from Kaggle datasets and user uploads, extracts key financial information, stores the results in both vector and relational databases, and allows users to ask natural language questions through a chatbot interface.

## Project Overview

The goal of this project is to transform unstructured financial documents, such as invoice and receipt images, into structured and queryable data.

The pipeline supports two main types of questions:

1. **Semantic questions**  
   Answered using vector search over extracted document information.  
   Example:  
   *“Which documents refer to office supplies?”*

2. **Mathematical / quantitative questions**  
   Answered using SQL queries over a structured relational database.  
   Example:  
   *“What is the total amount spent on fuel?”*


## System Architecture

The project was implemented as a three-agent pipeline:

### Agent 1 - Document Extraction Agent

Agent 1 ingests raw invoice and receipt images and applies VLM-based extraction to convert visual document content into structured JSON outputs.

Responsibilities:

- Ingest raw PNG invoice and receipt images.
- Process documents from both Kaggle datasets and user uploads.
- Use Claude Haiku 4.5 as a Visual Language Model for document understanding.
- Extract key fields such as vendor, date, total amount, tax information, item descriptions, and document type.
- Store processed outputs in AWS S3.
- Store semantic representations in an OpenSearch vector database.


### Agent 2 - Classification and Structuring Agent

Agent 2 reads the extracted JSON outputs, classifies documents, normalizes inconsistent field names, and stores clean structured records.

Responsibilities:

- Read extracted JSON files from AWS S3.
- Classify documents as invoices or receipts.
- Normalize semantically equivalent fields, such as:
  - `AFM`
  - `Tax Number`
  - `VAT ID`
- Create consistent schemas for invoices and receipts.
- Store structured records in a PostgreSQL relational database using AWS RDS.


### Agent 3 - Conversational Query Agent

Agent 3 serves as the user-facing conversational interface.

Responsibilities:

- Receive natural language questions from the user.
- Decide whether a question is semantic or mathematical.
- Use vector search for semantic questions.
- Use SQL queries for quantitative questions.
- Return natural language answers.
- Generate charts when numerical results are returned.


<img width="1920" height="1080" alt="PDF Extraction" src="https://github.com/user-attachments/assets/db3d88e5-1aaf-4bea-b281-d96c11b9f0d9" />


## Web Application

The project also includes a full-stack web interface.

Main features:

- Document upload page connected to the live processing pipeline.
- Chatbot interface for querying financial data in natural language.
- Conversation history for follow-up questions.
- Real-time document ingestion through the UI.
- Support for both Kaggle dataset documents and new user-uploaded invoices or receipts.


## Technologies Used

### Cloud Infrastructure

- **AWS S3** - storage for raw documents and processed JSON outputs.
- **AWS Bedrock** - access to foundation models and agent workflows.
- **AWS Lambda** - serverless execution for pipeline components.
- **AWS OpenSearch** - vector database for semantic search.
- **AWS RDS** - relational database for structured financial records.

### AI / Machine Learning

- **Claude Haiku 4.5** - Visual Language Model for document extraction.
- **Vector embeddings** - semantic representation of extracted document content.
- **RAG-style retrieval** - semantic question answering over document data.
- **Multi-agent workflow** - separate agents for extraction, structuring, and querying.

### Databases

- **OpenSearch Vector Database** - used for semantic search and document retrieval.
- **PostgreSQL** - used for structured financial data and SQL-based quantitative queries.

### Backend

- **Python** - data processing, agent logic, and pipeline orchestration.
- **FastAPI** - backend API for document upload and chatbot communication.
- **SQL** - querying structured invoice and receipt data.

### Frontend

- **React** - user interface development.
- **JavaScript / TypeScript** - frontend logic.
- **HTML / CSS** - UI structure and styling.

### Data

- **Kaggle invoice and receipt image dataset**
- **User-uploaded financial documents**


## Key Features

- Automatic extraction of financial data from invoice and receipt images.
- Document classification into invoices and receipts.
- Field normalization across inconsistent document formats.
- Hybrid storage architecture using both vector and relational databases.
- Natural language financial querying.
- Separation between semantic and mathematical questions.
- SQL-based calculations for totals, sums, and aggregations.
- Chart generation for numerical query results.
- Web-based document upload and chatbot interface.

## UI

<img width="1920" height="1080" alt="Copy of Το κείμενο της παραγράφου σας (2)" src="https://github.com/user-attachments/assets/4d7ff929-d25f-43ab-a60e-543310be98d7" />
<img width="1920" height="1080" alt="Copy of Το κείμενο της παραγράφου σας (5)" src="https://github.com/user-attachments/assets/aa9ef275-5ff7-4101-9918-286598c659ed" />
<img width="1920" height="1080" alt="Copy of Το κείμενο της παραγράφου σας (6)" src="https://github.com/user-attachments/assets/8d4d86b1-9863-46e8-9797-8cbbc78adb5c" />


