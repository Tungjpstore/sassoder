-- Refresh PostgREST schema cache after the cross-thread production migration batch.
-- New public API tables/routes can otherwise briefly see PGRST205 until cache refreshes.
notify pgrst, 'reload schema';
