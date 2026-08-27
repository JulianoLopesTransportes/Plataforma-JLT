-- Coleta e entrega de uma mesma mudança quase sempre caem em dias
-- diferentes: são dois compromissos, não um. O tipo "cliente" — que a tela
-- rotulava como "Mudança" — não conseguia dizer qual dos dois era.
--
-- Renomear em vez de criar valor novo e migrar: preserva as linhas já
-- gravadas, e o compromisso que existe hoje é uma coleta.
alter type tipo_compromisso rename value 'cliente' to 'coleta_mudanca';
