/**
 * MODUL VÂNZARI - STATISTICS
 * ===================================
 * Funcții pentru obținerea și gestionarea statisticilor vânzătorilor
 */

import { supabaseBrowser } from '@/lib/supabase/supabaseClient';
import type { Result, SellerStatisticsRecord, SellerStatsAggregated, SellerStatisticsDashboard, TopSeller } from './types';

const supabase = supabaseBrowser();

/**
 * Obține statistici agregate pentru toți vânzătorii
 */
export async function getAllSellersStatisticsAggregated(
  period: 'today' | 'week' | 'month'
): Promise<Result<SellerStatsAggregated[]>> {
  try {
    const today = new Date();
    
    let startDate: Date;
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);
    
    if (period === 'today') {
      startDate = new Date(today);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      startDate = new Date(today);
      startDate.setDate(today.getDate() - today.getDay());
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
    }

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Obține toate statisticile pentru perioadă
    const { data, error } = await supabase
      .from('seller_statistics')
      .select('*')
      .gte('date', startDateStr)
      .lte('date', endDateStr);

    if (error) throw error;

    // Agregează per user
    const userStats = new Map<string, SellerStatsAggregated>();
    
    (data as SellerStatisticsRecord[] || []).forEach(stat => {
      if (!userStats.has(stat.user_id)) {
        userStats.set(stat.user_id, {
          seller_id: stat.user_id,
          seller_email: undefined,
          period,
          callbacks_set: 0,
          nu_raspunde: 0,
          no_deal: 0,
          curier_trimis: 0,
          office_direct: 0,
          deals_closed: 0,
          service_files_created: 0,
          score: 0
        });
      }
      
      const current = userStats.get(stat.user_id)!;
      current.callbacks_set += stat.callback_count || 0;
      current.nu_raspunde += stat.no_deal_count || 0;
      current.no_deal += stat.no_deal_count || 0;
      current.curier_trimis += stat.curier_trimis_count || 0;
      current.office_direct += stat.office_direct_count || 0;
      
      // Scor ponderat
      current.score = 
        (current.callbacks_set * 1) +
        (current.nu_raspunde * 0.5) +
        (current.curier_trimis * 2) +
        (current.office_direct * 2) -
        (current.no_deal * 5);
    });

    return { data: Array.from(userStats.values()), error: null };
  } catch (error) {
    console.error('[getAllSellersStatisticsAggregated] Error:', error);
    return { data: null, error };
  }
}

/**
 * Obține top vânzători
 */
export async function getTopSellersList(
  period: 'today' | 'week' | 'month',
  limit: number = 10
): Promise<Result<TopSeller[]>> {
  try {
    const { data, error } = await getAllSellersStatisticsAggregated(period);
    if (error) throw error;
    
    // Sortează după scor și ia top N
    const sorted = (data || [])
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    // Convertește la TopSeller
    const topSellers: TopSeller[] = sorted.map(s => ({
      seller_id: s.seller_id,
      seller_name: s.seller_name,
      score: s.score,
      callbacks_set: s.callbacks_set,
      nu_raspunde: s.nu_raspunde,
      deals_closed: s.deals_closed,
      service_files_created: s.service_files_created
    }));
    
    return { data: topSellers, error: null };
  } catch (error) {
    console.error('[getTopSellersList] Error:', error);
    return { data: null, error };
  }
}

/**
 * Obține statistici complete pentru dashboard
 */
export async function getSellerStatisticsDashboard(): Promise<Result<SellerStatisticsDashboard>> {
  try {
    const [todayData, weekData, monthData] = await Promise.all([
      getAllSellersStatisticsAggregated('today'),
      getAllSellersStatisticsAggregated('week'),
      getAllSellersStatisticsAggregated('month')
    ]);

    if (todayData.error || weekData.error || monthData.error) {
      throw new Error('Error fetching statistics');
    }

    // Calculează sume pentru fiecare perioadă
    const sumStats = (stats: SellerStatsAggregated[]): SellerStatsAggregated => {
      return {
        seller_id: 'total',
        period: 'today',
        callbacks_set: stats.reduce((sum, s) => sum + s.callbacks_set, 0),
        nu_raspunde: stats.reduce((sum, s) => sum + s.nu_raspunde, 0),
        no_deal: stats.reduce((sum, s) => sum + s.no_deal, 0),
        curier_trimis: stats.reduce((sum, s) => sum + s.curier_trimis, 0),
        office_direct: stats.reduce((sum, s) => sum + s.office_direct, 0),
        deals_closed: stats.reduce((sum, s) => sum + s.deals_closed, 0),
        service_files_created: stats.reduce((sum, s) => sum + s.service_files_created, 0),
        score: 0
      };
    };

    return {
      data: {
        today: sumStats(todayData.data || []),
        week: sumStats(weekData.data || []),
        month: sumStats(monthData.data || [])
      },
      error: null
    };
  } catch (error) {
    console.error('[getSellerStatisticsDashboard] Error:', error);
    return { data: null, error };
  }
}

/**
 * Incrementează un contor specific în statistica vânzătorului
 */
export async function incrementSellerStatistic(
  userId: string,
  field: 'callback_count' | 'no_deal_count' | 'calls_made' | 'curier_trimis_count' | 'office_direct_count'
): Promise<boolean> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { error } = await supabase.rpc('increment_seller_statistic', {
      p_user_id: userId,
      p_date: today,
      p_field: field
    });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[incrementSellerStatistic] Error:', error);
    return false;
  }
}

// Export functions for backward compatibility
// Aliases for component compatibility
export const getAllSellersStatistics = getAllSellersStatisticsAggregated;
export const getTopSellers = getTopSellersList;

export async function getSellerStatistics(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<Result<SellerStatisticsRecord[]>> {
  try {
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('seller_statistics')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDateStr)
      .lte('date', endDateStr)
      .order('date', { ascending: true });

    if (error) throw error;
    return { data: (data as SellerStatisticsRecord[]) || [], error: null };
  } catch (error) {
    console.error('[getSellerStatistics] Error:', error);
    return { data: null, error };
  }
}

export async function getSellerStatisticsToday(
  userId: string
): Promise<Result<SellerStatisticsRecord>> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('seller_statistics')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return {
          data: {
            id: '',
            user_id: userId,
            date: today,
            callback_count: 0,
            no_deal_count: 0,
            calls_made: 0,
            curier_trimis_count: 0,
            office_direct_count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          } as any,
          error: null
        };
      }
      throw error;
    }

    if (!data) {
      return {
        data: {
          id: '',
          user_id: userId,
          date: today,
          callback_count: 0,
          no_deal_count: 0,
          calls_made: 0,
          curier_trimis_count: 0,
          office_direct_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        } as any,
        error: null
      };
    }

    return { data, error: null };
  } catch (error) {
    console.error('[getSellerStatisticsToday] Error:', error);
    return { data: null, error };
  }
}