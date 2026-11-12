# Bili Studio 4.4.1

- Corrige retomadas que repetiam uma fala silenciosa: até três tentativas com sementes distintas e regeneração de checkpoints inválidos.
- Amplia o reagrupamento local para 36 segundos/120 palavras quando uma fala precisa do intervalo da vizinha. Conserva texto, limites externos, ausência de sobreposição e aceleração máxima de 25%.
- No modo aula por aula, falhas são registradas no item e o restante da seleção continua. Ao final, informa quantas aulas ficaram prontas e quais precisam de retomada. Cancelar continua interrompendo o trabalho.
- Libera a tradução local da GPU antes da síntese. A instância padrão do Ollama de outros programas permanece independente.

Vídeos e vozes anteriores são preservados. Uma geração que não consegue produzir fala válida ou acomodar o conteúdo ainda pode exigir revisão; essa pendência não impede o processamento das outras aulas separadas.
