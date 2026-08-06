-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "is_leader" BOOLEAN NOT NULL DEFAULT false;

-- "Direção do culto" para as equipes que já existiam.
--
-- O seed de funções só roda na criação da equipe; sem isto, quem já tinha
-- equipe nunca ganharia a função nova. Mesmo padrão do seed de Multimídia/Som.
--
-- Idempotente pelo NOT EXISTS: rodar de novo (ou em ambiente onde a função foi
-- criada à mão) não duplica.
INSERT INTO positions (
  id, team_id, name, category, sort_order, is_active, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  t.id,
  nova.name,
  nova.categoria::"PositionCategory",
  COALESCE(
    (SELECT MAX(p.sort_order) FROM positions p WHERE p.team_id = t.id),
    -1
  ) + 1,
  true,
  NOW(),
  NOW()
FROM teams t
CROSS JOIN (VALUES ('Direção do culto', 'OTHER')) AS nova(name, categoria)
WHERE NOT EXISTS (
  SELECT 1 FROM positions existente
  WHERE existente.team_id = t.id AND existente.name = nova.name
);
