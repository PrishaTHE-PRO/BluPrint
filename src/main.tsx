import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import RoomResult from './pages/RoomResult';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RoomResult />
  </StrictMode>
);
