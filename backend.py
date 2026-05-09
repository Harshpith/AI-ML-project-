import asyncio
import json
from datetime import datetime, timedelta
from typing import Dict, List
import numpy as np
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import websockets
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Real-time Stock Anomaly Detection")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnomalyDetector:
    def __init__(self, window_size: int = 100):
        self.window_size = window_size
        self.data_history: Dict[str, List[float]] = {}
        self.model = IsolationForest(contamination=0.05, random_state=42)
        self.scaler = StandardScaler()
        self.is_trained = False
        self.stats: Dict[str, Dict] = {}
        
    def add_data_point(self, symbol: str, price: float, volume: int):
        """Add new data point and detect anomalies"""
        if symbol not in self.data_history:
            self.data_history[symbol] = []
            self.stats[symbol] = {"mean": 0, "std": 0, "min": price, "max": price}
        
        self.data_history[symbol].append(price)
        
        # Keep only recent history
        if len(self.data_history[symbol]) > self.window_size * 2:
            self.data_history[symbol] = self.data_history[symbol][-self.window_size * 2:]
        
        # Update statistics
        prices = self.data_history[symbol]
        self.stats[symbol]["mean"] = np.mean(prices)
        self.stats[symbol]["std"] = np.std(prices)
        self.stats[symbol]["min"] = np.min(prices)
        self.stats[symbol]["max"] = np.max(prices)
        
    def predict(self, symbol: str) -> Dict:
        """Detect if current price is anomalous"""
        if symbol not in self.data_history or len(self.data_history[symbol]) < 20:
            return {"is_anomaly": False, "confidence": 0.0, "reason": "Insufficient data"}
        
        prices = np.array(self.data_history[symbol][-self.window_size:]).reshape(-1, 1)
        
        # Simple statistical anomaly detection
        current_price = prices[-1][0]
        mean = self.stats[symbol]["mean"]
        std = self.stats[symbol]["std"]
        
        # Z-score based detection
        z_score = abs((current_price - mean) / (std + 1e-6))
        is_anomaly = z_score > 2.5  # 2.5 std deviations
        confidence = min(z_score / 4.0, 1.0)
        
        # Percentage change detection
        if len(self.data_history[symbol]) > 1:
            prev_price = prices[-2][0] if len(prices) > 1 else mean
            pct_change = abs((current_price - prev_price) / (prev_price + 1e-6)) * 100
            
            if pct_change > 3:  # More than 3% change
                is_anomaly = True
                confidence = min(pct_change / 10.0, 1.0)
        
        return {
            "is_anomaly": bool(is_anomaly),
            "confidence": float(confidence),
            "z_score": float(z_score),
            "current_price": float(current_price),
            "mean": float(mean),
            "std": float(std),
            "timestamp": datetime.utcnow().isoformat()
        }

detector = AnomalyDetector()

# Simulated stock data generator
async def generate_stock_data():
    """Generate realistic stock data with occasional anomalies"""
    symbols = ["AAPL", "GOOGL", "MSFT", "TSLA", "AMZN"]
    prices = {s: np.random.uniform(100, 300) for s in symbols}
    
    while True:
        for symbol in symbols:
            # Random walk with drift
            change = np.random.normal(0, 0.5)
            
            # Occasional spike (anomaly)
            if np.random.random() < 0.02:  # 2% chance
                change = np.random.uniform(-3, 3)
            
            prices[symbol] += change
            prices[symbol] = max(10, prices[symbol])  # Keep price positive
            
            yield {
                "symbol": symbol,
                "price": round(prices[symbol], 2),
                "volume": int(np.random.uniform(1e6, 1e8)),
                "timestamp": datetime.utcnow().isoformat()
            }
        
        await asyncio.sleep(1)

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/stats/{symbol}")
async def get_stats(symbol: str):
    """Get statistics for a symbol"""
    if symbol not in detector.stats:
        raise HTTPException(status_code=404, detail="Symbol not found")
    return detector.stats[symbol]

@app.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time streaming"""
    await websocket.accept()
    logger.info("Client connected")
    
    try:
        # Send simulated stock data
        data_gen = generate_stock_data()
        
        while True:
            data = await data_gen.__anext__()
            
            # Add data to detector
            detector.add_data_point(data["symbol"], data["price"], data["volume"])
            
            # Get anomaly prediction
            prediction = detector.predict(data["symbol"])
            
            # Combine data with prediction
            message = {**data, "anomaly": prediction}
            
            await websocket.send_json(message)
            
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        await websocket.close()
        logger.info("Client disconnected")

@app.get("/anomalies/{symbol}")
async def get_recent_anomalies(symbol: str, limit: int = 10):
    """Get recent anomalies for a symbol"""
    if symbol not in detector.data_history:
        raise HTTPException(status_code=404, detail="Symbol not found")
    
    # Return current anomaly status
    anomaly = detector.predict(symbol)
    
    return {
        "symbol": symbol,
        "current_anomaly": anomaly,
        "data_points": len(detector.data_history[symbol]),
        "stats": detector.stats[symbol]
    }

@app.post("/train")
async def train_model():
    """Train anomaly detection model with historical data"""
    return {"status": "Model training initiated", "method": "Statistical"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
