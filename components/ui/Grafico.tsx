'use client';

/**
 * GRÁFICO — invólucro fino sobre o Chart.js.
 *
 * Feito à mão em vez de usar react-chartjs-2 para não acrescentar uma
 * dependência: o que o wrapper precisa fazer é criar o chart, destruí-lo no
 * unmount e recriá-lo quando os dados mudam. São ~40 linhas.
 *
 * As cores das séries saem dos tokens --chart-N lidos do CSS, para que a
 * paleta dos gráficos continue vindo de tokens.css como todo o resto.
 */

import { useEffect, useRef } from 'react';
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
  type ChartConfiguration,
  type ChartType,
} from 'chart.js';
import estilos from './ui.module.css';

// Registro explícito: só o que usamos entra no bundle.
Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
);

/** Lê a paleta de séries de tokens.css. */
export function paletaGraficos(): string[] {
  if (typeof window === 'undefined') return [];
  const estilo = getComputedStyle(document.documentElement);
  return [1, 2, 3, 4, 5, 6, 7, 8]
    .map((n) => estilo.getPropertyValue(`--chart-${n}`).trim())
    .filter(Boolean);
}

function token(nome: string, alternativa: string): string {
  if (typeof window === 'undefined') return alternativa;
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || alternativa;
}

type Props = {
  tipo: ChartType;
  rotulos: string[];
  series: {
    rotulo: string;
    dados: number[];
    /** Índice na paleta de tokens. Sem isto, usa a ordem das séries. */
    cor?: number;
    preenchido?: boolean;
  }[];
  altura?: number;
  /** Formata os valores no tooltip e no eixo Y — normalmente formatarBRL. */
  formatarValor?: (valor: number) => string;
  /** Doughnut colore por fatia, não por série. */
  corPorItem?: boolean;
  mostrarLegenda?: boolean;
};

export default function Grafico({
  tipo,
  rotulos,
  series,
  altura = 280,
  formatarValor,
  corPorItem = false,
  mostrarLegenda = true,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const paleta = paletaGraficos();
    const corTexto = token('--color-gray-600', '#6f665d');
    const corGrade = token('--color-border', '#e6dfd6');

    const config: ChartConfiguration = {
      type: tipo,
      data: {
        labels: rotulos,
        datasets: series.map((serie, i) => {
          const cor = paleta[(serie.cor ?? i) % paleta.length];
          return {
            label: serie.rotulo,
            data: serie.dados,
            backgroundColor: corPorItem
              ? rotulos.map((_, j) => paleta[j % paleta.length])
              : serie.preenchido
                ? `${cor}22`
                : cor,
            borderColor: cor,
            borderWidth: tipo === 'line' ? 2.5 : 0,
            fill: serie.preenchido ?? false,
            tension: 0.3,
            pointRadius: tipo === 'line' ? 3 : undefined,
            borderRadius: tipo === 'bar' ? 4 : undefined,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: mostrarLegenda && (series.length > 1 || corPorItem),
            position: corPorItem ? 'right' : 'top',
            labels: { color: corTexto, boxWidth: 12, font: { size: 12 } },
          },
          tooltip: {
            callbacks: formatarValor
              ? {
                  label: (ctx) => {
                    const valor = ctx.parsed.y ?? ctx.parsed;
                    return `${ctx.dataset.label ?? ctx.label}: ${formatarValor(Number(valor))}`;
                  },
                }
              : undefined,
          },
        },
        scales:
          tipo === 'doughnut' || tipo === 'pie'
            ? undefined
            : {
                x: {
                  ticks: { color: corTexto, font: { size: 11.5 } },
                  grid: { display: false },
                },
                y: {
                  beginAtZero: true,
                  ticks: {
                    color: corTexto,
                    font: { size: 11.5 },
                    callback: (valor) =>
                      formatarValor ? formatarValor(Number(valor)) : String(valor),
                  },
                  grid: { color: corGrade },
                },
              },
      },
    };

    chartRef.current = new Chart(canvas, config);

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [tipo, rotulos, series, formatarValor, corPorItem, mostrarLegenda]);

  return (
    <div className={estilos.grafico} style={{ height: altura }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
