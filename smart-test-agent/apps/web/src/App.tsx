import { ConfigProvider } from 'antd';
import { BrowserRouter } from 'react-router-dom';

function App() {
  return (
    <ConfigProvider>
      <BrowserRouter>
        <div className="app">
          <h1>Smart Test Agent</h1>
          <p>PRD-Based UI Testing Agent System</p>
        </div>
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;
