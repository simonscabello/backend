### Task 7: FormulÃ¡rio e detalhe do culto

**Files:**
- Create: `app/lib/features/events/presentation/event_form_screen.dart`
- Create: `app/lib/features/events/presentation/event_detail_screen.dart`

- [ ] **Step 1: EventFormScreen**

`FormScaffold` + campos: tÃ­tulo, date/time culto, date/time ensaio (opcional, clearÃ¡vel), local, notas, paleta (`hintText: 'Preto e dourado'`).  
Pickers: `showDatePicker` / `showTimePicker` com locale `pt_BR`.  
Montar `DateTime` no timezone da equipe e enviar `toUtc().toIso8601String()`.  
Salvar: create ou update; invalidar providers; `context.pop`.  
Erros: `FormErrorBanner` com `ApiException.message`.

- [ ] **Step 2: EventDetailScreen**

Mostrar tÃ­tulo, data/hora culto, ensaio, local, notas, paleta.  
SeÃ§Ãµes placeholder:
- "Equipe escalada â€” em breve"
- "Musicas â€” em breve"  
AppBar: editar (LEADER+) â†’ form; excluir com diÃ¡logo de confirmaÃ§Ã£o.  
Usar `eventProvider(eventId)`.

---
