-- Em migration própria porque ADD VALUE não pode ser usado na mesma
-- transação em que é criado. Separar evita a armadilha se alguém depois
-- acrescentar um UPDATE aqui.
alter type tipo_compromisso add value if not exists 'entrega_mudanca' after 'coleta_mudanca';
