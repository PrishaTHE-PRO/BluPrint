import React, { useState } from 'react';

export default function RoomPlanner({ userId = "saanvi_demo" }) {
    // 1. This keeps track of what you type in the boxes
    const [roomName, setRoomName] = useState('');
    const [width, setWidth] = useState('');
    const [length, setLength] = useState('');
    const [height, setHeight] = useState('');

    // 2. Live calculations for area!
    const wNum = parseFloat(width) || 0;
    const lNum = parseFloat(length) || 0;
    const calculatedSqft = wNum * lNum;

    // 3. SVG Box Math (Scaling the room shape to fit perfectly inside a 300px box)
    const CANVAS_SIZE = 300;
    const maxDim = Math.max(wNum, lNum);
    const scale = maxDim > 0 ? (CANVAS_SIZE - 60) / maxDim : 0; // leaves room for side text labels

    const boxWidth = wNum * scale;
    const boxLength = lNum * scale;

    // Centers the layout inside our canvas box
    const xCoordinate = (CANVAS_SIZE - boxWidth) / 2;
    const yCoordinate = (CANVAS_SIZE - boxLength) / 2;

    // 4. What happens when you click "Save Room"
    const handleSave = async (e) => {
        e.preventDefault();
        if (!roomName || wNum <= 0 || lNum <= 0) {
            alert("Please enter a room name and numbers greater than 0!");
            return;
        }

        const roomData = {
            userId,
            name: roomName,
            widthFt: wNum,
            lengthFt: lNum,
            heightFt: parseFloat(height) || 8
        };

        try {
            const res = await fetch('/api/rooms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(roomData),
            });
            if (!res.ok) throw new Error('Save failed');
            const saved = await res.json();
            alert(`🎉 Saved "${saved.name}" (${saved.sqft} sqft) to the database!`);
            setRoomName(''); setWidth(''); setLength(''); setHeight('');
        } catch (err) {
            alert('❌ Could not save room. Is the server running?');
        }
    };

    return (
        <div style={{ display: 'flex', gap: '30px', padding: '20px', fontFamily: 'sans-serif' }}>

            {/* LEFT COLUMN: Input Form */}
            <div style={{ flex: 1, background: '#f5f5f7', padding: '20px', borderRadius: '12px' }}>
                <h3>📐 Step 1: Input Dimensions</h3>
                <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <label>Room Name:
                        <input type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="e.g. Living Room" style={{ width: '100%', padding: '8px', marginTop: '4px' }} />
                    </label>
                    <label>Width (feet):
                        <input type="number" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="0" style={{ width: '100%', padding: '8px', marginTop: '4px' }} />
                    </label>
                    <label>Length (feet):
                        <input type="number" value={length} onChange={(e) => setLength(e.target.value)} placeholder="0" style={{ width: '100%', padding: '8px', marginTop: '4px' }} />
                    </label>
                    <label>Height (feet):
                        <input type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="8" style={{ width: '100%', padding: '8px', marginTop: '4px' }} />
                    </label>

                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#007bff', margin: '10px 0' }}>
                        Live Calculation: {calculatedSqft} sq. ft.
                    </div>

                    <button type="submit" style={{ background: '#28a745', color: 'white', padding: '10px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                        💾 Step 3: Save Room to Dashboard
                    </button>
                </form>
            </div>

            {/* RIGHT COLUMN: Magic Graph Paper Preview */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <h3>🖼️ Step 2: Live Room Layout</h3>
                <div style={{ border: '2px dashed #bbb', borderRadius: '8px', background: '#fff', width: CANVAS_SIZE, height: CANVAS_SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {wNum > 0 && lNum > 0 ? (
                        <svg width={CANVAS_SIZE} height={CANVAS_SIZE}>
                            {/* Dynamic room box drawn using react state math */}
                            <rect x={xCoordinate} y={yCoordinate} width={boxWidth} height={boxLength} fill="#e3f2fd" stroke="#0d47a1" strokeWidth="3" rx="4" />
                            {/* Top Text label for Width */}
                            <text x={CANVAS_SIZE / 2} y={yCoordinate - 10} textAnchor="middle" fill="#0d47a1" fontWeight="bold">{wNum} ft wide</text>
                            {/* Left Text label for Length */}
                            <text x={xCoordinate - 10} y={CANVAS_SIZE / 2} textAnchor="middle" fill="#0d47a1" fontWeight="bold" transform={`rotate(-90, ${xCoordinate - 10}, ${CANVAS_SIZE / 2})`}>{lNum} ft long</text>
                        </svg>
                    ) : (
                        <span style={{ color: '#aaa', fontSize: '14px' }}>Type dimensions to see preview</span>
                    )}
                </div>
            </div>

        </div>
    );
}