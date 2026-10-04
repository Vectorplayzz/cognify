# vector-service/main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Any
import chromadb
from chromadb.config import Settings as ChromaSettings

app = FastAPI(title="Cognify Vector DB Service")

# Persistent ChromaDB (shared across all users)
chroma_client = chromadb.PersistentClient(path="chroma_db")
collection = chroma_client.get_or_create_collection(
    name="shared_knowledge",
    metadata={"hnsw:space": "cosine"}
)

class DocumentAdd(BaseModel):
    id: str
    embedding: List[float]
    content: str
    metadata: dict = {}

@app.post("/add")
async def add_documents(docs: List[DocumentAdd]):
    """Add or update documents in the vector database."""
    collection.upsert(
        ids=[doc.id for doc in docs],
        embeddings=[doc.embedding for doc in docs],
        documents=[doc.content for doc in docs],
        metadatas=[doc.metadata for doc in docs],
    )
    return {"status": "ok", "added": len(docs)}

class QueryRequest(BaseModel):
    query_embedding: List[float]
    top_k: int = 5

@app.post("/query")
async def query(req: QueryRequest):
    """Retrieve top-k similar documents from the vector database."""
    results = collection.query(
        query_embeddings=[req.query_embedding],
        n_results=req.top_k,
        include=["documents", "metadatas", "distances"]
    )
    # Flatten results
    hits = []
    if results["ids"] and len(results["ids"][0]) > 0:
        for i in range(len(results["ids"][0])):
            hits.append({
                "id": results["ids"][0][i],
                "content": results["documents"][0][i],
                "metadata": results["metadatas"][0][i],
                "score": 1 - results["distances"][0][i]  # cosine similarity
            })
    return {"results": hits}

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
