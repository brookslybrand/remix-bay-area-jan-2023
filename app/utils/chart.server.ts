import type { Deposit } from "@prisma/client";
import { scaleTime, scaleLinear } from "d3-scale";
import { line, curveStepAfter } from "d3-shape";

export interface InvoiceChart {
  dPath: string;
  yAxis: Point[];
  xAxis: Point[];
  points: Point[];
}

interface Point {
  x: number;
  y: number;
  label: string;
}

type Deposits = Array<Pick<Deposit, "id" | "amount" | "depositDate">>;

interface Dimensions {
  width: number;
  height: number;
  margin: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export function generateInvoiceChart(
  deposits: Deposits,
  { width, height, margin }: Dimensions
): InvoiceChart | null {
  if (deposits.length === 0) return null;

  const data = calculateCumulativeDeposits(deposits);
  const firstEntry = data[0];
  const lastEntry = data[data.length - 1];

  const yScale = scaleLinear()
    .domain([firstEntry.y, lastEntry.y])
    .nice()
    .range([height - margin.bottom, margin.top]);
  const xScale = scaleTime()
    .domain([firstEntry.x, lastEntry.x])
    .range([margin.left, width - margin.right]);

  const lineGenerator = line<{ x: Date; y: number }>()
    .x((d) => xScale(d.x))
    .y((d) => yScale(d.y))
    .curve(curveStepAfter);

  const dPath = lineGenerator(data);

  if (dPath === null) {
    throw new Error(
      `Something went wrong: line generation failed with data ${data}`
    );
  }

  const points = data.map(({ x, y }) => ({
    x: xScale(x),
    y: yScale(y),
    label: `${formatDate(x)} - ${formatAmount(y)}`,
  }));

  return {
    dPath,
    yAxis: [
      {
        x: xScale(firstEntry.x),
        y: yScale(firstEntry.y) - margin.top,
        label: formatAmount(firstEntry.y),
      },
      {
        x: xScale(lastEntry.x),
        y: yScale(lastEntry.y) - margin.top,
        label: formatAmount(lastEntry.y),
      },
    ],
    xAxis: [
      {
        x: xScale(firstEntry.x),
        y: height,
        label: formatDate(firstEntry.x),
      },
      {
        x: xScale(lastEntry.x),
        y: height,
        label: formatDate(lastEntry.x),
      },
    ],
    points,
  };
}

function calculateCumulativeDeposits(
  deposits: Deposits
): { x: Date; y: number }[] {
  const amountPerDate = new Map<Date, number>();
  for (let { amount, depositDate } of deposits) {
    const currentAmount = amountPerDate.get(depositDate) ?? 0;
    amountPerDate.set(depositDate, currentAmount + amount);
  }

  const dates = [...amountPerDate.keys()].sort(
    (d1, d2) => d1.getDate() - d2.getDate()
  );

  let cumulativeAmount = 0;
  return dates.map((date) => {
    cumulativeAmount += amountPerDate.get(date) ?? 0;
    return { x: date, y: cumulativeAmount };
  });
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
  }).format(amount);
}

function formatDate(date: number | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}
