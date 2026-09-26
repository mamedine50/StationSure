import { creerClientServeur } from '@/lib/supabase/server';

/** Relevé de compte crédit exportable (CSV ; séparateur point-virgule, BOM pour Excel). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await creerClientServeur();
  const [{ data: compte }, { data: lignes }] = await Promise.all([
    supabase.from('credit_accounts').select('customer_name').eq('id', id).maybeSingle(),
    supabase.rpc('credit_account_statement', { p_account_id: id }),
  ]);
  if (!compte) return new Response('Not found', { status: 404 });
  const rows = [
    [
      'date',
      'type',
      'montant_fcfa',
      'solde_fcfa',
      'vehicule',
      'employe',
      'transaction_id',
      'paiement_id',
    ],
  ];
  for (const l of lignes ?? [])
    rows.push([
      l.at ?? '',
      l.kind ?? '',
      String(l.amount_fcfa ?? 0),
      String(l.balance_fcfa ?? 0),
      l.vehicle_plate ?? '',
      l.employee_name ?? '',
      l.transaction_id ?? '',
      l.payment_id ?? '',
    ]);
  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\n');
  return new Response(`\uFEFF${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="releve-${compte.customer_name.replace(/[^a-z0-9]+/gi, '-')}.csv"`,
    },
  });
}
