import { useState } from 'react'
import { login, setToken } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import DispatchLogo from './DispatchLogo'

interface Props {
  onLogin: () => void
  onSetup?: () => void
}

export default function Login({ onLogin, onSetup }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return

    try {
      setLoading(true)
      setError('')
      const res = await login(email.trim(), password)
      setToken(res.token)
      onLogin()
    } catch {
      setError('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-1">
            <DispatchLogo className="h-10 w-10" />
          </div>
          <CardTitle className="text-2xl font-bold">Dispatch</CardTitle>
          <CardDescription>OTA Updates</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                placeholder="admin@dispatch.dev"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading || !email.trim() || !password}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
          {onSetup && (
            <p className="text-center text-xs text-muted-foreground mt-4">
              First time?{' '}
              <button className="text-primary hover:underline" onClick={onSetup}>
                Set up your server
              </button>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
