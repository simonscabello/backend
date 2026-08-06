-- AlterTable
ALTER TABLE "event_services" ADD COLUMN     "template_id" UUID;

-- CreateTable
CREATE TABLE "service_templates" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_minutes" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_templates_team_id_weekday_start_minutes_idx" ON "service_templates"("team_id", "weekday", "start_minutes");

-- CreateIndex
CREATE INDEX "event_services_template_id_idx" ON "event_services"("template_id");

-- AddForeignKey
ALTER TABLE "event_services" ADD CONSTRAINT "event_services_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "service_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_templates" ADD CONSTRAINT "service_templates_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grade inicial das equipes que ja existem.
--
-- Mesma grade que toda equipe nova recebe (ver DEFAULT_SERVICE_TEMPLATES em
-- teams.service.ts): domingo de manha e de noite, mais quinta. E ponto de
-- partida editavel, nao regra -- sem ela a tela de nova escala abriria vazia
-- para quem ja tinha equipe.
INSERT INTO "service_templates" ("id", "team_id", "label", "weekday", "start_minutes", "sort_order", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), t."id", g.label, g.weekday, g.start_minutes, g.sort_order, true, NOW(), NOW()
FROM "teams" t
CROSS JOIN (VALUES
  ('Manhã', 0, 510, 0),   -- domingo 08:30
  ('Noite', 0, 1140, 1),  -- domingo 19:00
  ('Quinta', 4, 1170, 2)  -- quinta 19:30
) AS g(label, weekday, start_minutes, sort_order);
