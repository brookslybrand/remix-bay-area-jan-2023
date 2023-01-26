import { scaleLinear, scaleTime } from "d3-scale";
import { curveStepAfter, line } from "d3-shape";
import invariant from "tiny-invariant";
import type { Deposit } from "@prisma/client";

export interface InvoiceChart {
  dPath: string;
  yAxis: [Point, Point];
  xAxis: [Point, Point];
  points: Point[];
}

interface Point {
  x: number;
  y: number;
  label: string;
}

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

type Deposits = Pick<Deposit, "id" | "amount" | "depositDate">[];

export function generateInvoiceChart(
  deposits: Deposits,
  { width, height, margin }: Dimensions
): InvoiceChart | undefined {
  if (deposits.length < 2) return undefined;

  const data = calculateCumulativeDeposits(deposits);
  const firstEntry = data[0];
  const lastEntry = data[data.length - 1];

  const yScale = scaleLinear()
    .domain([firstEntry.y, lastEntry.y])
    .range([height, 0])
    .nice();
  const xScale = scaleTime()
    .domain([firstEntry.x, lastEntry.x])
    .range([0, width]);

  const lineGenerator = line<{ x: Date; y: number }>()
    .x((d) => xScale(d.x))
    .y((d) => yScale(d.y))
    .curve(curveStepAfter);

  const dPath = lineGenerator(data);

  invariant(
    dPath !== null,
    `Something went wrong: line generation failed with data ${data}`
  );

  const yAxis = [
    {
      x: xScale(firstEntry.x),
      y: yScale(firstEntry.y) - margin.top / 2,
      label: format.amount.format(firstEntry.y),
    },
    {
      x: xScale(lastEntry.x),
      y: yScale(lastEntry.y) - margin.top / 2,
      label: format.amount.format(lastEntry.y),
    },
  ] satisfies InvoiceChart["yAxis"];
  const xAxis = [
    {
      x: xScale(firstEntry.x),
      y: height + (margin.bottom * 2) / 3,
      label: format.date.format(firstEntry.x),
    },
    {
      x: xScale(lastEntry.x),
      y: height + (margin.bottom * 2) / 3,
      label: format.date.format(lastEntry.x),
    },
  ] satisfies InvoiceChart["xAxis"];

  const points = data.map(({ x, y }) => ({
    x: xScale(x),
    y: yScale(y),
    label: `${format.date.format(x)} - ${format.amount.format(y)}`,
  }));

  return {
    dPath,
    yAxis,
    xAxis,
    points,
  };
}

function calculateCumulativeDeposits(deposits: Deposits) {
  const amountPerDate = new Map<Date, number>();
  for (const { amount, depositDate } of deposits) {
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

const format = {
  amount: new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
  }),
  date: new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }),
};
