import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  let isTokenExpired = false;

  if (supabaseUrl && supabaseKey && supabaseUrl !== 'https://your-project.supabase.co') {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      redirect('/login');
    } else {
      const { data: userData } = await supabase.from('users').select('tenant_id').eq('auth_id', user.id).single();
      if (userData?.tenant_id) {
        const { data: tenant } = await supabase.from('tenants').select('onboarding_completed, wa_token_expired').eq('id', userData.tenant_id).single();
        if (tenant && tenant.onboarding_completed === false) {
          redirect('/onboard');
        }
        isTokenExpired = !!tenant?.wa_token_expired;
      }
    }
  }

  return (
    <>
      {isTokenExpired && (
        <div className="bg-red-600 text-white text-center p-3 font-medium text-sm flex items-center justify-center gap-2 shadow-sm z-50 relative">
          <span>⚠️</span>
          <span>
            <strong>WhatsApp Disconnected!</strong> Your Meta access token has expired. Customers are not receiving replies. 
            <a href="/dashboard/settings" className="underline ml-2 hover:text-white/80 transition-colors">Reconnect WhatsApp now &rarr;</a>
          </span>
        </div>
      )}
      {children}
    </>
  );
}
