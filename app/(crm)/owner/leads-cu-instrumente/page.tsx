'use client'

import { useEffect, useState } from 'react'
import { useRole } from '@/lib/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Lock, Package, Users, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface LeadItem {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
}

export default function LeadsCuInstrumentePage() {
  const { isOwner, loading: roleLoading } = useRole()
  const [leads, setLeads] = useState<LeadItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function loadData() {
    try {
      const res = await fetch('/api/owner/leads-cu-instrumente')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Eroare')
      setLeads(data.leads || [])
      setTotal(data.total ?? 0)
    } catch (err: any) {
      console.error(err)
      setLeads([])
      setTotal(0)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (roleLoading) return
    if (isOwner) loadData()
    else setLoading(false)
  }, [roleLoading])

  const handleRefresh = () => {
    setRefreshing(true)
    loadData()
  }

  if (roleLoading || (isOwner && loading && leads.length === 0)) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Skeleton className="h-12 w-64" />
      </div>
    )
  }

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <Lock className="h-16 w-16 text-amber-500 opacity-50" />
        <h2 className="text-xl font-semibold">Acces restricționat</h2>
        <p className="text-muted-foreground text-center max-w-sm">
          Această pagină este disponibilă doar pentru proprietar.
        </p>
        <Link href="/dashboard">
          <Button variant="outline">Înapoi la Dashboard</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <header className="border-b border-border p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Lead-uri cu instrumente</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Toate lead-urile care au avut vreodată instrumente în fișe/tăvițe
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={refreshing ? 'h-4 w-4 mr-2 animate-spin' : 'h-4 w-4 mr-2'} />
          Actualizează
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Total</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {loading && !refreshing ? (
              <Skeleton className="h-10 w-24" />
            ) : (
              <p className="text-3xl font-bold">{total}</p>
            )}
            <p className="text-sm text-muted-foreground mt-1">
              lead-uri cu instrumente
            </p>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Lista clienți</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {loading && !refreshing ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : leads.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nu există lead-uri cu instrumente.</p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">#</th>
                      <th className="text-left p-3 font-medium">Nume client</th>
                      <th className="text-left p-3 font-medium hidden sm:table-cell">Email</th>
                      <th className="text-left p-3 font-medium hidden md:table-cell">Telefon</th>
                      <th className="w-20 p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead, idx) => (
                      <tr key={lead.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3 text-muted-foreground">{idx + 1}</td>
                        <td className="p-3 font-medium">{lead.name}</td>
                        <td className="p-3 text-muted-foreground hidden sm:table-cell truncate max-w-[200px]">
                          {lead.email || '—'}
                        </td>
                        <td className="p-3 text-muted-foreground hidden md:table-cell">
                          {lead.phone || '—'}
                        </td>
                        <td className="p-3">
                          <Link
                            href={`/leads/vanzari?openLeadId=${encodeURIComponent(lead.id)}`}
                            className="text-primary hover:underline text-xs"
                          >
                            Deschide
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
