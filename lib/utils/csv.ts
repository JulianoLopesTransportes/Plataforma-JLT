/**
 * EXPORTAÇÃO CSV — usada pelo Financeiro e pelos Relatórios.
 */

import { hojeISO } from './formato';

/**
 * Gera e baixa um CSV.
 *
 * Duas decisões que evitam dor de cabeça no Excel brasileiro:
 *  - separador ponto e vírgula, porque em pt-BR a vírgula é o separador
 *    decimal e o Excel jogaria tudo numa coluna só;
 *  - BOM no início, sem o qual o Excel lê o arquivo como Latin-1 e os
 *    acentos chegam quebrados.
 */
export function baixarCSV(nomeArquivo: string, linhas: string[][]): void {
  const conteudo = linhas
    .map((linha) => linha.map((celula) => `"${String(celula).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');

  const blob = new Blob([`﻿${conteudo}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${nomeArquivo}-${hojeISO()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Número no formato que o Excel pt-BR entende como número: vírgula decimal. */
export function numeroParaCSV(valor: number): string {
  return valor.toFixed(2).replace('.', ',');
}
