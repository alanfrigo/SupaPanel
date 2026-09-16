'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Member = { role: string; user: { id: string; email: string; name: string | null } }
export default function CompanyMembers() {
  const { id } = useParams<{ id: string }>()
  const [members, setMembers] = useState<Member[]>([])
  const [companyName, setCompanyName] = useState('Company')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('developer')
  const [password, setPassword] = useState('')
  const [installationAdmin, setInstallationAdmin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setMembers([]); setLoading(true); setError('')
    Promise.all([fetch(`/api/companies/${id}/members`, { signal: controller.signal }), fetch('/api/companies', { signal: controller.signal })])
      .then(async ([r, c]) => {
        const data = await r.json(); if (!r.ok) throw new Error(data.error)
        const companies = await c.json(); if (!c.ok) throw new Error(companies.error)
        if (controller.signal.aborted) return
        setMembers(data.members); setInstallationAdmin(data.installationAdmin)
        setCompanyName(companies.companies.find((item: { id: string }) => item.id === id)?.name || 'Company')
      }).catch(e => { if (!controller.signal.aborted) setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id])
  async function update(method: string, targetEmail: string) {
    setBusy(true); setError(''); setMessage('')
    try {
      const r = await fetch(`/api/companies/${id}/members`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: targetEmail, role, ...(method === 'PUT' ? { password } : {}) }) })
      const data = await r.json(); if (!r.ok) throw new Error(data.error)
      setEmail(''); setPassword(''); setMessage(method === 'DELETE' ? 'Acesso removido.' : 'Membro salvo.')
      const refreshed = await fetch(`/api/companies/${id}/members`)
      if (!refreshed.ok) { setMembers([]); throw new Error('Seu acesso à gestão de membros foi encerrado. Volte aos projetos.') }
      setMembers((await refreshed.json()).members)
    } catch(e) { setError(e instanceof Error ? e.message : 'Falha ao atualizar membros.') }
    finally { setBusy(false) }
  }
  return <main className="mx-auto max-w-3xl space-y-6 px-5 py-10">
    <Link href={`/dashboard?companyId=${id}`} className="text-sm text-primary">← Voltar aos projetos</Link>
    <div><p className="text-sm text-muted-foreground">{companyName}</p><h1 className="mt-2 text-3xl font-semibold">Membros da Company</h1></div>
    <p className="text-sm text-muted-foreground">Owner administra a Company; admin gerencia membros e projetos; developer opera as instâncias; viewer acompanha a visão geral sem acesso aos dados ou segredos.</p>
    {error && <p role="alert" className="rounded border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="text-sm text-primary">{message}</p>}
    {loading ? <p>Carregando membros…</p> : <>
      <div className="divide-y rounded-lg border bg-card">
        {members.map(m => <div key={m.user.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0"><p className="break-all text-sm">{m.user.email}</p><p className="text-xs text-muted-foreground">{m.role}</p></div>
          <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => { setEmail(m.user.email); setRole(m.role); setPassword('') }}>Editar papel</Button><Button variant="ghost" disabled={busy} onClick={() => void update('DELETE', m.user.email)}>Remover acesso</Button></div>
        </div>)}
      </div>
      <form className="space-y-4 rounded-lg border bg-card p-5" onSubmit={e => { e.preventDefault(); void update('PUT', email) }}>
        <h2 className="font-medium">Adicionar membro ou atualizar papel</h2>
        <div className="space-y-2"><Label htmlFor="email">Email da conta</Label><Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="role">Papel nesta Company</Label><select id="role" value={role} onChange={e => setRole(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{['owner','admin','developer','viewer'].map(r => <option key={r}>{r}</option>)}</select></div>
        {installationAdmin && <div className="space-y-2"><Label htmlFor="password">Senha para conta nova (opcional)</Label><Input id="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /><p className="text-xs text-muted-foreground">Preencha somente para cadastrar uma conta que ainda não existe. Contas existentes mantêm sua senha. Nenhum email é enviado.</p></div>}
        <Button disabled={busy || !members.length}>{busy ? 'Salvando…' : 'Salvar membro'}</Button>
      </form>
    </>}
  </main>
}
