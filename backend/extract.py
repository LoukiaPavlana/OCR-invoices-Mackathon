import os
import json
import zipfile
from pathlib import Path
import boto3

# CONFIGURATION
KAGGLE_DATASET = "osamahosamabdellatif/high-quality-invoice-images-for-ocr"
DOWNLOAD_PATH = "datasets"
EXTRACT_PATH = "extracted"

# ⚠️ SOS: Συμπληρώστε αυτά τα στοιχεία από τον AWS λογαριασμό σας
S3_BUCKET_NAME = "ΤΟ_ONOMA_TOY_S3_BUCKET_SAS" 
AWS_KNOWLEDGE_BASE_ID = "YOUR_KNOWLEDGE_BASE_ID" 
AWS_MODEL_ARN = "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-v1:0"

# INITIALIZE AWS CLIENTS
session = boto3.Session(region_name="us-east-1")
s3_client = session.client("s3")
bedrock_agent_client = session.client("bedrock-agent-runtime")

# Create folders
Path(DOWNLOAD_PATH).mkdir(exist_ok=True)
Path(EXTRACT_PATH).mkdir(exist_ok=True)

# ==========================================
# STEP 1: DOWNLOAD KAGGLE DATASET
# ==========================================
def download_dataset():
    print("⏳ Downloading dataset from Kaggle...")
    os.system(f"kaggle datasets download -d {KAGGLE_DATASET} -p {DOWNLOAD_PATH}")
    print("✅ Download completed.")

# ==========================================
# STEP 2: EXTRACT ZIP FILES
# ==========================================
def extract_zip():
    print("⏳ Extracting zip files...")
    for file in os.listdir(DOWNLOAD_PATH):
        if file.endswith(".zip"):
            print(f"Extracting: {file}")
            with zipfile.ZipFile(os.path.join(DOWNLOAD_PATH, file), "r") as zip_ref:
                zip_ref.extractall(EXTRACT_PATH)
    print("✅ Extraction completed.")

# ==========================================
# STEP 3: UPLOAD TO AMAZON S3
# ==========================================
def upload_to_s3():
    print(f"⏳ Uploading files to Amazon S3 Bucket ({S3_BUCKET_NAME})...")
    supported_formats = [".jpg", ".jpeg", ".png", ".pdf"]
    
    for root, dirs, files in os.walk(EXTRACT_PATH):
        for file in files:
            file_path = os.path.join(root, file)
            ext = Path(file).suffix.lower()
            
            if ext in supported_formats:
                s3_key = f"invoices/{file}"
                try:
                    s3_client.upload_file(file_path, S3_BUCKET_NAME, s3_key)
                    print(f"Uploaded to S3: {file}")
                except Exception as e:
                    print(f"❌ Failed to upload {file}: {e}")
    print("✅ All documents uploaded to AWS Cloud S3!")

# ==========================================
# STEP 4: CHAT WITH AMAZON VECTOR DB & LLM
# ==========================================
def ask_aws_knowledge_base():
    print("\n🚀 FinDoc AI Cloud Agent Ready (Connected to Amazon OpenSearch & Claude 3.5)")
    print("Type 'exit' to stop.\n")

    while True:
        query = input("Ask question: ")
        if query.lower() == "exit":
            break

        try:
            response = bedrock_agent_client.retrieve_and_generate(
                input={"text": query},
                retrieveAndGenerateConfiguration={
                    "type": "KNOWLEDGE_BASE",
                    "knowledgeBaseConfiguration": {
                        "knowledgeBaseId": AWS_KNOWLEDGE_BASE_ID,
                        "modelArn": AWS_MODEL_ARN
                    }
                }
            )

            output_text = response["output"]["text"]
            print("\n======================")
            print("AI AGENT RESPONSE")
            print("======================\n")
            print(output_text)
            print("\n--------------------\n")

        except Exception as e:
            print(f"❌ ERROR: {e}")

# ==========================================
# MAIN
# ==========================================
if __name__ == "__main__":
    # 1. Κατεβάζει
    download_dataset()
    # 2. Κάνει Extract
    extract_zip()
    # 3. Τα στέλνει στο Cloud
    upload_to_s3()
    
    print("\n💡 Πριν συνεχίσεις, μπες στο AWS Console, πατήστε 'Sync' στην Knowledge Base σου ώστε η Amazon DB να διαβάσει τα νέα αρχεία από το S3!")
    input("Πατήστε Enter αφού ολοκληρωθεί το Sync στο AWS Console για να ξεκινήσει το Chat...")
    
    # 4. Ανοίγει το Chat
    ask_aws_knowledge_base()