-- 1. Habilitar ejecución remota de SQL (si no estaba ya)
CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
END;
$$;

-- 2. Borrar tabla radio_assignments y sus dependencias (políticas en otras tablas)
-- Usamos CASCADE para eliminar automáticamente las políticas que fallaban antes
DROP TABLE IF EXISTS radio_assignments CASCADE;

-- 3. Recrear tabla radio_assignments
CREATE TABLE radio_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  radio_id uuid REFERENCES radios(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(admin_id, radio_id)
);

-- 4. Habilitar seguridad en radio_assignments
ALTER TABLE radio_assignments ENABLE ROW LEVEL SECURITY;

-- 5. Restaurar política propia de radio_assignments
CREATE POLICY "Admins can view their assignments" ON radio_assignments
    FOR SELECT USING (auth.uid() = admin_id OR exists (select 1 from profiles where id = auth.uid() and role = 'super_admin'));

-- 6. Restaurar políticas dependientes en otras tablas (que se borraron por el CASCADE)

-- 6.1. Política en tabla 'radios'
DROP POLICY IF EXISTS "Admin view assigned radios" ON radios;
CREATE POLICY "Admin view assigned radios" ON radios
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM radio_assignments ra 
            WHERE ra.radio_id = radios.id 
            AND ra.admin_id = auth.uid()
        ) 
        OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
    );

-- 6.2. Política en tabla 'verifications'
DROP POLICY IF EXISTS "Admin access assigned verifications" ON verifications;
CREATE POLICY "Admin access assigned verifications" ON verifications
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM radio_assignments ra 
            WHERE ra.radio_id = verifications.radio_id 
            AND ra.admin_id = auth.uid()
        )
        OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
    );

-- 6.3. Política en tabla 'batch_jobs'
DROP POLICY IF EXISTS "Admin access assigned batch_jobs" ON batch_jobs;
CREATE POLICY "Admin access assigned batch_jobs" ON batch_jobs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM radio_assignments ra 
            WHERE ra.radio_id = batch_jobs.radio_id 
            AND ra.admin_id = auth.uid()
        )
        OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
    );

-- 7. Confirmación
SELECT 'Tabla radio_assignments recreada y políticas restauradas correctamente' as resultado;
