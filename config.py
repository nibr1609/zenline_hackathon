import os
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
WEAVIATE_URL = os.getenv("WEAVIATE_URL")
WEAVIATE_API_KEY = os.getenv("WEAVIATE_API_KEY")

COLLECTION_NAME = "ProductSubstitute"
DEFAULT_TOP_K = 100
LOCAL_STORE_PATH = "data/target_index.json"
OPENAI_MODEL = "openai/gpt-4o"
