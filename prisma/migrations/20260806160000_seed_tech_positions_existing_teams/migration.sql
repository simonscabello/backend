-- Multimídia e Som para as equipes que já existiam.
--
-- A migration anterior criou o valor TECH do enum e o campo is_guest, mas o
-- seed de funções só roda quando a equipe é criada. Sem isto, uma equipe
-- cadastrada antes desta versão nunca ganharia as funções de apoio, e o líder
-- não teria como escalar a multimídia nem o som.
--
-- Idempotente de propósito: o `NOT EXISTS` deixa a migration segura em
-- ambientes onde as funções já foram inseridas à mão (foi o caso do ambiente
-- de desenvolvimento).

INSERT INTO positions (
  id, team_id, name, category, sort_order, is_active, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  t.id,
  novas.name,
  novas.categoria::"PositionCategory",
  -- Entram no fim da lista, depois das funções da banda.
  COALESCE(
    (SELECT MAX(p.sort_order) FROM positions p WHERE p.team_id = t.id),
    -1
  ) + novas.ordem,
  true,
  NOW(),
  NOW()
FROM teams t
CROSS JOIN (
  VALUES ('Multimídia', 'TECH', 1),
         ('Som',        'TECH', 2)
) AS novas(name, categoria, ordem)
WHERE NOT EXISTS (
  SELECT 1 FROM positions existente
  WHERE existente.team_id = t.id AND existente.name = novas.name
);
