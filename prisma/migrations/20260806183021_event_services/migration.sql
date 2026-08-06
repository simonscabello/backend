-- CreateTable
CREATE TABLE "event_services" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "event_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_services_event_id_starts_at_idx" ON "event_services"("event_id", "starts_at");

-- AddForeignKey
ALTER TABLE "event_services" ADD CONSTRAINT "event_services_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: toda escala que ja existe vira uma escala de um culto so.
--
-- Sem isto as escalas antigas ficariam sem culto nenhum e sumiriam o horario
-- da tela de detalhe. O rotulo generico "Culto" e proposital: nao da para
-- adivinhar se um culto de 08:30 cadastrado no passado era "Manha" na cabeca
-- de quem cadastrou.
INSERT INTO "event_services" ("id", "event_id", "label", "starts_at", "sort_order")
SELECT gen_random_uuid(), "id", 'Culto', "starts_at", 0
FROM "events";
