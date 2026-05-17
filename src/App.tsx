// src/App.tsx
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import React, { ReactElement, useEffect } from 'react'

import Home from './pages/Home'
import Login from './pages/Login'
import UploadUsersExtra from './pages/UploadUsersExtra'
import ImageSettings from './pages/ImageSettings'
import AdminAnswers from './pages/AdminAnswers'
import ThemeTest from './pages/ThemeTest'
import TestCheckinSecurity from './pages/TestCheckinSecurity'
import GameCreate from './pages/games/GameCreate'
import GameEdit from './pages/games/GameEdit'
import GamesList from './pages/games/GamesList'
import GamePlay from './pages/games/GamePlay'
import AdminLayout from './components/AdminLayout'
import { initializePrefetching } from './services/prefetching'
import { ThemeProvider } from './contexts/ThemeContext'

function RequireAuth({ children }: { children: ReactElement }) {
  const [authed, setAuthed] = React.useState<boolean | null>(null)
  const location = useLocation()
  
  React.useEffect(() => {
    let mounted = true
    let unsubscribe: (() => void) | null = null
    
    const checkAuth = async () => {
      try {
        const { onAuthStateChange } = await import('./services/firebase-auth')
        
        // Use onAuthStateChange directly - it will wait for auth state to restore
        // and fire immediately with current user, then on any changes
        unsubscribe = onAuthStateChange((user) => {
          if (mounted) {
            setAuthed(!!user)
          }
        })
      } catch (error) {
        console.error('Error checking auth:', error)
        if (mounted) {
          setAuthed(false)
        }
      }
    }
    
    checkAuth()
    
    return () => {
      mounted = false
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [])
  
  // ยกเว้น root ที่มี ?id=... (ผู้เล่น)
  const search = new URLSearchParams(location.search)
  const isPublicPlayer = location.pathname === '/' && search.has('id')
  if (isPublicPlayer) return children
  
  // Show nothing while checking auth
  if (authed === null) return null
  
  return authed ? children : <Navigate to="/login" replace state={{ from: location }} />
}

// ประตูผู้เล่น: /?id=... → ไปเล่น, ไม่งั้นไปล็อกอิน
function PlayerGate() {
  const location = useLocation()
  const id = new URLSearchParams(location.search).get('id')
  return id ? <Navigate to={`/play/${id}`} replace /> : <Navigate to="/login" replace />
}

export default function App() {
  // Initialize prefetching system
  useEffect(() => {
    initializePrefetching()
  }, [])

  return (
    <ThemeProvider>
      <Routes>
        {/* ผู้เล่น (สาธารณะ) */}
        <Route path="/" element={<PlayerGate />} />
        <Route path="/play/:id" element={<GamePlay />} />
        {/* เผื่อผู้ใช้กดลิงก์รูปแบบอื่น → ส่งเข้า GamePlay เช่นกัน */}
        <Route path="/games/play/:id" element={<GamePlay />} />
        <Route path="/games/:id/play" element={<GamePlay />} />

        {/* หน้าแอดมิน (ไม่ต้องล็อกอิน) */}
        <Route path="/admin/answers/:gameId" element={<AdminAnswers />} />

        {/* เข้าสู่ระบบ */}
        <Route path="/login" element={<Login />} />

        {/* Theme Test (สำหรับทดสอบ) */}
        <Route path="/theme-test" element={<ThemeTest />} />
        
        {/* Security Test (สำหรับทดสอบช่องโหว่) */}
        <Route path="/test-checkin-security" element={<TestCheckinSecurity />} />
        {/* Alias สำหรับ backward compatibility */}
        <Route path="/test-security" element={<TestCheckinSecurity />} />
        
        {/* แอดมิน (ต้องล็อกอิน) — AdminLayout ให้ sidebar + body */}
        <Route element={<RequireAuth><AdminLayout /></RequireAuth>}>
          <Route path="/home" element={<Home />} />
          <Route path="/upload-users-extra" element={<UploadUsersExtra />} />
          <Route path="/image-settings" element={<ImageSettings />} />
          <Route path="/games" element={<GamesList />} />
          <Route path="/games/:id" element={<GameEdit />} />
          <Route path="/creategame" element={<GameCreate />} />
        </Route>
        
        {/* อื่น ๆ → กลับหน้า root */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  )
}
