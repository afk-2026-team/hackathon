import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// 공통 토큰·클래스를 먼저 불러 화면별 CSS(styles/*.css)가 그 위에 덮이게 한다
import './styles.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
