import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/AuthContext'
import Index from './pages/Index'
import Conexao from './pages/Conexao'
import ConversaPage from './pages/Conversa'
import NotFound from './pages/NotFound'
import Login from './pages/Login'
import AccessDenied from './pages/AccessDenied'
import {
  ChangeEmail,
  ConfirmEmailChange,
  ForgotPassword,
  ResetPassword,
  VerifyEmail,
} from './pages/AccountFlows'
import Layout from './components/Layout'

const App = () => (
  <BrowserRouter>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner position="bottom-right" />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/confirm-email-change" element={<ConfirmEmailChange />} />
          <Route path="/access-denied" element={<AccessDenied />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Index />} />
            <Route path="/conversa/:id" element={<ConversaPage />} />
            <Route path="/conexao" element={<Conexao />} />
            <Route path="/change-email" element={<ChangeEmail />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </TooltipProvider>
  </BrowserRouter>
)

export default App
