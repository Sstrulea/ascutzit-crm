"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Crown, Shield, Activity, TrendingUp, CheckCircle } from "lucide-react"

interface DashboardStats {
  totalMembers: number
  owners: number
  admins: number
  members: number
  activeMembers: number
  weeklyStats: {
    newLeads: number
    sales: number
    activePipelines: number
  }
  recentActivity: ActivityLog[]
}

interface ActivityLog {
  id: string
  userId: string
  email: string
  name: string
  action: string
  timestamp: string
}

interface StatCardProps {
  label: string
  value: number
  icon: React.ReactNode
}

function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-2">{value}</p>
          </div>
          <div className="h-12 w-12 text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

interface StatsListProps {
  stats: {
    newLeads: number
    sales: number
    activePipelines: number
  }
}

function StatsList({ stats }: StatsListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-blue-500" />
          <span className="font-medium">Leads noi</span>
        </div>
        <span className="text-2xl font-bold">{stats.newLeads.toLocaleString()}</span>
      </div>
      
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-green-500" />
          <span className="font-medium">Vânzări</span>
        </div>
        <span className="text-2xl font-bold">{stats.sales.toLocaleString()}</span>
      </div>
      
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-purple-500" />
          <span className="font-medium">Pipeline-uri active</span>
        </div>
        <span className="text-2xl font-bold">{stats.activePipelines}</span>
      </div>
    </div>
  )
}

interface ActivityListProps {
  activities: ActivityLog[]
}

function ActivityList({ activities }: ActivityListProps) {
  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nu există activitate recentă.
      </div>
    )
  }

  function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Acum'
    if (diffMins < 60) return `Acum ${diffMins} min`
    if (diffHours < 24) return `Acum ${diffHours} h`
    if (diffDays === 1) return 'Ieri'
    return `Acum ${diffDays} zile`
  }

  return (
    <div className="space-y-3">
      {activities.slice(0, 5).map(activity => (
        <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
          <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{activity.email}</div>
            <div className="text-sm text-muted-foreground truncate">
              {activity.name || 'Fără nume'}
            </div>
          </div>
          <div className="text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">
            {formatTimestamp(activity.timestamp)}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function OverviewDashboard({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard 
          label="Total Membri" 
          value={stats.totalMembers}
          icon={<Users className="h-6 w-6" />}
        />
        <StatCard 
          label="Owners" 
          value={stats.owners}
          icon={<Crown className="h-6 w-6 text-yellow-500" />}
        />
        <StatCard 
          label="Admini" 
          value={stats.admins}
          icon={<Shield className="h-6 w-6 text-blue-500" />}
        />
      </div>

      {/* System Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Statistici Sistem (Ultima Săptămână)</CardTitle>
        </CardHeader>
        <CardContent>
          <StatsList stats={stats.weeklyStats} />
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Utilizatori Activi Recent (Ultima 24h)</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityList activities={stats.recentActivity} />
        </CardContent>
      </Card>
    </div>
  )
}