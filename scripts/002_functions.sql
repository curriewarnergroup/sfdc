-- ============================================================
-- Device PIN management (server-side verification only)
-- password_hash column stores the PIN; verification is done
-- in a SECURITY DEFINER function so the column is never
-- exposed to the client via RLS.
-- ============================================================

-- Verify device PIN - called only from service-role context
CREATE OR REPLACE FUNCTION verify_device_pin(p_device_id UUID, p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  SELECT password_hash INTO v_hash
  FROM devices
  WHERE id = p_device_id AND is_active = TRUE;
  IF v_hash IS NULL THEN RETURN FALSE; END IF;
  RETURN (v_hash = p_pin);
END;
$$;

-- Upsert a kiosk device with a PIN
CREATE OR REPLACE FUNCTION upsert_device(p_station_name TEXT, p_pin TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO devices (station_name, password_hash)
  VALUES (p_station_name, p_pin)
  ON CONFLICT (station_name)
  DO UPDATE SET password_hash = EXCLUDED.password_hash
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Seed demo kiosk devices (PIN = 1234)
SELECT upsert_device('Kiosk-01', '1234');
SELECT upsert_device('Kiosk-02', '1234');

-- Seed demo shopfloor users
INSERT INTO shopfloor_users (user_code, display_name, role)
VALUES
  ('OP001',  'Alice Turner',  'OPERATOR'),
  ('OP002',  'Bob Harris',    'OPERATOR'),
  ('SET001', 'Carol White',   'SETTER'),
  ('QC001',  'Dave Singh',    'QC'),
  ('ADM001', 'Eve Manager',   'ADMIN')
ON CONFLICT (user_code) DO NOTHING;
