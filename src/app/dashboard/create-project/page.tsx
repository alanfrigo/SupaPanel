'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function CreateProjectPage() {
  const [companies, setCompanies] = useState<{ id: string; name: string; role: string }[]>([])
  const [companyId, setCompanyId] = useState('')
  useEffect(() => {
    fetch('/api/companies').then(async r => {
      if (!r.ok) throw new Error('Não foi possível carregar as Companies.')
      const data = await r.json()
      const available = data.companies.filter((c: { role: string }) => c.role !== 'viewer')
      setCompanies(available)
      const requested = new URLSearchParams(window.location.search).get('companyId')
      setCompanyId(available.find((c: { id: string }) => c.id === requested)?.id || available[0]?.id || '')
    }).catch(e => setError(e.message))
  }, [])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNameChange = (e: any) => {
    setName(e.target.value)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDescriptionChange = (e: any) => {
    setDescription(e.target.value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!name.trim()) {
      setError('Project name is required')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ companyId, name: name.trim(), description: description.trim() }),
      })

      if (response.ok) {
        const data = await response.json()
        // Redirect to project configuration page
        router.push(`/dashboard/projects/${data.project.id}/configure`)
      } else {
        const data = await response.json()
        setError(data.error || 'Failed to create project')
      }
    } catch {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="SupaPanel"
              width={110}
              height={48}
              className="object-contain"
            />
          </div>
          <Link href={companyId ? `/dashboard?companyId=${companyId}` : "/dashboard"}>
            <Button variant="outline">Voltar aos projetos</Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">Novo projeto</h2>
            <p className="text-muted-foreground">
              Um Supabase completo, com dados e credenciais independentes.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Detalhes do projeto</CardTitle>
              <CardDescription>
                Escolha um nome. Geramos as credenciais e preparamos os serviços para você.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <select id="company" required className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={companyId} onChange={e => setCompanyId(e.target.value)}>
                    {!companies.length && <option value="">Nenhuma Company disponível</option>}
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <p className="text-sm text-muted-foreground">O projeto começa com a branch main e uma instância independente.</p>
                </div>
                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="name">Nome do projeto *</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Ex.: App de clientes"
                    value={name}
                    onChange={handleNameChange}
                    maxLength={80}
                    autoFocus
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    Um identificador único será gerado automaticamente.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descrição (opcional)</Label>
                  <Input
                    id="description"
                    type="text"
                    placeholder="Para que você vai usar esta instância?"
                    value={description}
                    onChange={handleDescriptionChange}
                  />
                </div>

                <div className="bg-primary/10 border border-primary/20 text-primary px-4 py-3 rounded">
                  <p className="text-sm">
                    <strong>Próximo passo:</strong> Configure seu domínio e clique em Salvar e implantar. Na primeira criação, o download do Supabase pode levar alguns minutos.
                  </p>
                </div>

                <div className="flex gap-4">
                  <Button type="submit" disabled={loading || !companyId}>
                    {loading ? 'Preparando instância…' : 'Criar projeto'}
                  </Button>
                  <Link href={companyId ? `/dashboard?companyId=${companyId}` : "/dashboard"}>
                    <Button type="button" variant="outline">
                      Cancelar
                    </Button>
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
