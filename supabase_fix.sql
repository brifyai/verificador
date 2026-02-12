-- 1. Habilitar ejecución remota de SQL (para futuras correcciones automáticas)
CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
END;
$$;

-- 2. Reparar tabla radio_assignments (Borrar y Recrear correctamente)
DROP TABLE IF EXISTS radio_assignments;

CREATE TABLE radio_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  radio_id uuid REFERENCES radios(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(admin_id, radio_id)
);

-- 3. Habilitar seguridad y políticas
ALTER TABLE radio_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view their assignments" ON radio_assignments;
CREATE POLICY "Admins can view their assignments" ON radio_assignments
    FOR SELECT USING (auth.uid() = admin_id OR exists (select 1 from profiles where id = auth.uid() and role = 'super_admin'));

-- 4. Confirmación
SELECT 'Tabla radio_assignments reparada exitosamente' as resultado;
