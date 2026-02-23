import { redirect } from "next/navigation"

export default function HomePage() {
  // La deschiderea app-ului mergem direct la view-ul de lead-uri (Vânzări)
  redirect("/leads/vanzari")
}
