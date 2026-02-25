'use client';

import { supabaseBrowser } from '@/lib/supabase/supabaseClient';

export type Service = {
  id: string;
  name: string;
  price: number;      
  instrument_id: string | null;
  department_id: string | null;
  time: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

const supabase = supabaseBrowser();

/**
 * Fetches all services from the database, ordered by name.
 * Returns services with price cast to number for UI consistency.
 */
export async function listServices(): Promise<Service[]> {
  const { data, error } = await supabase
    .from('services')
    .select('id,name,price,instrument_id,department_id,active,created_at,updated_at')
    .order('name', { ascending: true });

  if (error) throw error;

  // price is numeric in PG and may come as string; cast to number for UI
  return (data ?? []).map((s: any) => ({
    ...s,
    price: Number(s.price),
    instrument_id: s.instrument_id ?? null,
    department_id: s.department_id ?? null,
  }));
}

/**
 * Creates a new service with the given name and price.
 * Associates the service with the currently authenticated user as created_by.
 */
export async function createService(input: {
  name: string;
  price: number;
}) {
  // created_by has no default in your SQL; include it
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) throw userErr ?? new Error('No user');

  const { error } = await supabase.from('services').insert({
    name: input.name.trim(),
    price: input.price,
    created_by: userRes.user.id,
  } as any);
  if (error) throw error;
}

/**
 * Deletes a service by its ID.
 * @param id - The ID of the service to delete
 */
export async function deleteService(id: string) {
  const { error } = await supabase.from('services').delete().eq('id', id);
  if (error) throw error;
}