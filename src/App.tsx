import Router from './Router';
import { WebSocketProvider } from './contexts/WebSocketContext';


function App() {
  return (
    <WebSocketProvider>
      <Router />
    </WebSocketProvider>
  );
}

export default App;
