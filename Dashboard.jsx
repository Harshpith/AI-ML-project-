import React, { useState, useEffect, useRef } from 'react';
import './Dashboard.css';

const Dashboard = () => {
  const [data, setData] = useState({});
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [history, setHistory] = useState({});
  const wsRef = useRef(null);
  const chartCanvasRef = useRef(null);

  useEffect(() => {
    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/stream`;
    
    wsRef.current = new WebSocket(wsUrl);
    
    wsRef.current.onopen = () => {
      setConnectionStatus('Connected');
      console.log('WebSocket connected');
    };
    
    wsRef.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      setData(prev => ({
        ...prev,
        [message.symbol]: message
      }));
      
      // Keep history for charting
      setHistory(prev => ({
        ...prev,
        [message.symbol]: [
          ...(prev[message.symbol] || []),
          message
        ].slice(-100) // Keep last 100 data points
      }));
    };
    
    wsRef.current.onerror = (error) => {
      setConnectionStatus('Error');
      console.error('WebSocket error:', error);
    };
    
    wsRef.current.onclose = () => {
      setConnectionStatus('Disconnected');
    };
    
    return () => {
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    // Draw chart
    if (chartCanvasRef.current && history[selectedSymbol]) {
      const canvas = chartCanvasRef.current;
      const ctx = canvas.getContext('2d');
      const points = history[selectedSymbol];
      
      if (points.length < 2) return;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Calculate scaling
      const prices = points.map(p => p.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceRange = maxPrice - minPrice || 1;
      
      const padding = 40;
      const width = canvas.width - 2 * padding;
      const height = canvas.height - 2 * padding;
      
      // Draw grid
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 5; i++) {
        const y = padding + (height / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(canvas.width - padding, y);
        ctx.stroke();
      }
      
      // Draw price line
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      points.forEach((point, idx) => {
        const x = padding + (idx / (points.length - 1 || 1)) * width;
        const y = padding + height - ((point.price - minPrice) / priceRange) * height;
        
        if (idx === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
      
      // Highlight anomalies
      points.forEach((point, idx) => {
        if (point.anomaly?.is_anomaly) {
          const x = padding + (idx / (points.length - 1 || 1)) * width;
          const y = padding + height - ((point.price - minPrice) / priceRange) * height;
          
          ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      
      // Draw axes
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padding, padding);
      ctx.lineTo(padding, canvas.height - padding);
      ctx.lineTo(canvas.width - padding, canvas.height - padding);
      ctx.stroke();
      
      // Label axes
      ctx.fillStyle = '#000';
      ctx.font = '12px Arial';
      ctx.fillText(`$${minPrice.toFixed(2)}`, 5, canvas.height - padding + 15);
      ctx.fillText(`$${maxPrice.toFixed(2)}`, 5, padding + 15);
    }
  }, [selectedSymbol, history]);

  const symbols = Object.keys(data);
  const currentData = data[selectedSymbol];

  return (
    <div className="dashboard">
      <header className="header">
        <h1>📈 Real-Time Stock Anomaly Detection</h1>
        <div className={`status ${connectionStatus.toLowerCase()}`}>
          <span className="dot"></span>
          {connectionStatus}
        </div>
      </header>

      <main className="main-content">
        <div className="symbols-grid">
          {symbols.map(symbol => {
            const symbolData = data[symbol];
            const isAnomaly = symbolData?.anomaly?.is_anomaly;
            
            return (
              <div
                key={symbol}
                className={`symbol-card ${isAnomaly ? 'anomaly' : ''} ${selectedSymbol === symbol ? 'selected' : ''}`}
                onClick={() => setSelectedSymbol(symbol)}
              >
                <div className="symbol-header">
                  <h3>{symbol}</h3>
                  {isAnomaly && <span className="anomaly-badge">⚠️ ANOMALY</span>}
                </div>
                <div className="symbol-price">${symbolData?.price?.toFixed(2)}</div>
                <div className="symbol-volume">Vol: {(symbolData?.volume / 1e6).toFixed(1)}M</div>
                {symbolData?.anomaly && (
                  <div className="anomaly-confidence">
                    Confidence: {(symbolData.anomaly.confidence * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {currentData && (
          <div className="detail-section">
            <h2>{selectedSymbol} Analysis</h2>
            
            <canvas
              ref={chartCanvasRef}
              className="chart"
              width={800}
              height={300}
            ></canvas>

            <div className="metrics-grid">
              <div className="metric">
                <label>Current Price</label>
                <div className="value">${currentData.price.toFixed(2)}</div>
              </div>
              
              <div className="metric">
                <label>Mean Price</label>
                <div className="value">${currentData.anomaly?.mean?.toFixed(2)}</div>
              </div>
              
              <div className="metric">
                <label>Std Dev</label>
                <div className="value">${currentData.anomaly?.std?.toFixed(2)}</div>
              </div>
              
              <div className="metric">
                <label>Z-Score</label>
                <div className="value">{currentData.anomaly?.z_score?.toFixed(2)}</div>
              </div>
              
              <div className="metric">
                <label>Volume</label>
                <div className="value">{(currentData.volume / 1e6).toFixed(2)}M</div>
              </div>
              
              <div className="metric">
                <label>Anomaly</label>
                <div className={`value ${currentData.anomaly?.is_anomaly ? 'anomaly' : 'normal'}`}>
                  {currentData.anomaly?.is_anomaly ? 'YES' : 'NO'}
                </div>
              </div>
            </div>

            {currentData.anomaly?.is_anomaly && (
              <div className="alert alert-warning">
                ⚠️ <strong>Anomaly Detected!</strong> 
                {currentData.anomaly.confidence > 0.8 && ' High confidence anomaly.'}
                {currentData.anomaly.reason && ` (${currentData.anomaly.reason})`}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <p>Real-time ML-powered anomaly detection • WebSocket streaming • Built with React + FastAPI</p>
      </footer>
    </div>
  );
};

export default Dashboard;
