import type { LoaderArgs, ActionArgs, LinksFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Link,
  useCatch,
  useFetcher,
  useLoaderData,
  useParams,
  useNavigation,
} from "@remix-run/react";
import { inputClasses, LabelText, submitButtonClasses } from "~/components";
import { getInvoiceDetails } from "~/models/invoice.server";
import type { LineItem, DueStatus } from "~/models/invoice.server";
import { requireUser } from "~/session.server";
import { currencyFormatter, parseDate } from "~/utils";
import type { Deposit } from "~/models/deposit.server";
import { createDeposit } from "~/models/deposit.server";
import invariant from "tiny-invariant";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useSpinDelay } from "spin-delay";
import { scaleLinear, scaleTime } from "d3-scale";
import { curveStepAfter, line } from "d3-shape";

import tooltipStyles from "~/styles/tooltip.css";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: tooltipStyles },
];

type LoaderData = {
  customerName: string;
  customerId: string;
  totalAmount: number;
  dueStatus: DueStatus;
  dueDisplay: string;
  invoiceDateDisplay: string;
  lineItems: Array<
    Pick<LineItem, "id" | "quantity" | "unitPrice" | "description">
  >;
  deposits: Array<
    Pick<Deposit, "id" | "amount"> & { depositDateFormatted: string }
  >;
};

export async function loader({ request, params }: LoaderArgs) {
  await requireUser(request);
  const { invoiceId } = params;
  if (typeof invoiceId !== "string") {
    throw new Error("This should be unpossible.");
  }
  const invoiceDetails = await getInvoiceDetails(invoiceId);
  if (!invoiceDetails) {
    throw new Response("not found", { status: 404 });
  }

  return json<LoaderData>({
    customerName: invoiceDetails.invoice.customer.name,
    customerId: invoiceDetails.invoice.customer.id,
    totalAmount: invoiceDetails.totalAmount,
    dueStatus: invoiceDetails.dueStatus,
    dueDisplay: invoiceDetails.dueStatusDisplay,
    invoiceDateDisplay: invoiceDetails.invoice.invoiceDate.toLocaleDateString(),
    lineItems: invoiceDetails.invoice.lineItems.map((li) => ({
      id: li.id,
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
    })),
    deposits: invoiceDetails.invoice.deposits.map((deposit) => ({
      id: deposit.id,
      amount: deposit.amount,
      depositDateFormatted: deposit.depositDate.toLocaleDateString(),
    })),
  });
}

type ActionData = {
  errors: {
    amount: string | null;
    depositDate: string | null;
  };
};

function validateAmount(amount: number) {
  if (amount <= 0) return "Must be greater than 0";
  if (Number(amount.toFixed(2)) !== amount) {
    return "Must only have two decimal places";
  }
  return null;
}

function validateDepositDate(date: Date) {
  if (Number.isNaN(date.getTime())) {
    return "Please enter a valid date";
  }
  return null;
}

export async function action({ request, params }: ActionArgs) {
  await requireUser(request);
  const { invoiceId } = params;
  if (typeof invoiceId !== "string") {
    throw new Error("This should be unpossible.");
  }
  const formData = await request.formData();
  const intent = formData.get("intent");
  invariant(typeof intent === "string", "intent required");
  switch (intent) {
    case "create-deposit": {
      const amount = Number(formData.get("amount"));
      const depositDateString = formData.get("depositDate");
      const note = formData.get("note");
      invariant(!Number.isNaN(amount), "amount must be a number");
      invariant(typeof depositDateString === "string", "dueDate is required");
      invariant(typeof note === "string", "dueDate is required");
      const depositDate = parseDate(depositDateString);

      const errors: ActionData["errors"] = {
        amount: validateAmount(amount),
        depositDate: validateDepositDate(depositDate),
      };
      const hasErrors = Object.values(errors).some(
        (errorMessage) => errorMessage
      );
      if (hasErrors) {
        return json<ActionData>({ errors });
      }

      await createDeposit({ invoiceId, amount, note, depositDate });
      return new Response("ok");
    }
    default: {
      throw new Error(`Unsupported intent: ${intent}`);
    }
  }
}

function usePendingData() {
  const data = useLoaderData<typeof loader>();
  const [previousData, setPreviousData] = useState(data);
  const navigation = useNavigation();

  const isNavigating = useSpinDelay(
    navigation.state !== "idle" &&
      navigation.location.pathname.startsWith("/sales/invoices/"),
    {
      delay: 200,
      minDuration: 400,
    }
  );

  useEffect(() => {
    if (!isNavigating) {
      setPreviousData(data);
    }
  }, [data, isNavigating]);

  return {
    data: previousData,
    isNavigating,
  };
}

export default function InvoiceRoute() {
  const { data, isNavigating } = usePendingData();

  return (
    <div className={clsx("relative p-10", isNavigating ? "opacity-50" : null)}>
      <Link
        to={`../../customers/${data.customerId}`}
        className="text-[length:14px] font-bold leading-6 text-blue-600 underline"
      >
        {data.customerName}
      </Link>
      <div className="text-[length:32px] font-bold leading-[40px]">
        {currencyFormatter.format(data.totalAmount)}
      </div>
      <LabelText>
        <span
          className={
            data.dueStatus === "paid"
              ? "text-green-brand"
              : data.dueStatus === "overdue"
              ? "text-red-brand"
              : ""
          }
        >
          {data.dueDisplay}
        </span>
        {` • Invoiced ${data.invoiceDateDisplay}`}
      </LabelText>
      <div className="h-4" />
      {data.lineItems.map((item) => (
        <LineItemContainer key={item.id}>
          <div>{item.description}</div>
          {item.quantity === 1 ? null : (
            <div className="text-[10px]">({item.quantity}x)</div>
          )}
          <div>{currencyFormatter.format(item.unitPrice)}</div>
        </LineItemContainer>
      ))}
      <LineItemContainer className="font-bold">
        <div>Net Total</div>
        <div>{currencyFormatter.format(data.totalAmount)}</div>
      </LineItemContainer>
      <div className="h-8" />
      <Deposits deposits={data.deposits} />
    </div>
  );
}

interface DepositFormControlsCollection extends HTMLFormControlsCollection {
  amount?: HTMLInputElement;
  depositDate?: HTMLInputElement;
  note?: HTMLInputElement;
  intent?: HTMLButtonElement;
}
interface DepositFormElement extends HTMLFormElement {
  readonly elements: DepositFormControlsCollection;
}

type DepositsProps = Pick<LoaderData, "deposits">;
function Deposits({ deposits: ogDeposits }: DepositsProps) {
  const newDepositFetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);

  const deposits = [...ogDeposits];

  if (newDepositFetcher.submission) {
    const amount = Number(newDepositFetcher.submission.formData.get("amount"));
    const depositDateVal =
      newDepositFetcher.submission.formData.get("depositDate");
    const depositDate =
      typeof depositDateVal === "string" ? parseDate(depositDateVal) : null;
    if (
      !validateAmount(amount) &&
      depositDate &&
      !validateDepositDate(depositDate)
    ) {
      deposits.push({
        id: "new",
        amount,
        depositDateFormatted: depositDate.toLocaleDateString(),
      });
    }
  }

  const errors = newDepositFetcher.data?.errors as
    | ActionData["errors"]
    | undefined;

  useEffect(() => {
    if (!formRef.current) return;
    if (newDepositFetcher.type !== "done") return;
    const formEl = formRef.current as DepositFormElement;
    if (errors?.amount) {
      formEl.elements.amount?.focus();
    } else if (errors?.depositDate) {
      formEl.elements.depositDate?.focus();
    } else if (document.activeElement === formEl.elements.intent) {
      formEl.reset();
      formEl.elements.amount?.focus();
    }
  }, [newDepositFetcher.type, errors]);

  return (
    <div>
      <div className="font-bold leading-8">Deposits</div>
      {deposits.length > 0 ? (
        <div>
          <DepositsLineChart deposits={deposits} />
        </div>
      ) : (
        <div>None yet</div>
      )}
      <newDepositFetcher.Form
        method="post"
        className="grid grid-cols-1 gap-x-4 gap-y-2 lg:grid-cols-2"
        ref={formRef}
        noValidate
      >
        <div className="min-w-[100px]">
          <div className="flex flex-wrap items-center gap-1">
            <LabelText>
              <label htmlFor="depositAmount">Amount</label>
            </LabelText>
            {errors?.amount ? (
              <em id="amount-error" className="text-d-p-xs text-red-600">
                {errors.amount}
              </em>
            ) : null}
          </div>
          <input
            id="depositAmount"
            name="amount"
            type="number"
            className={inputClasses}
            min="0.01"
            step="any"
            required
            aria-invalid={Boolean(errors?.amount) || undefined}
            aria-errormessage={errors?.amount ? "amount-error" : undefined}
          />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-1">
            <LabelText>
              <label htmlFor="depositDate">Date</label>
            </LabelText>
            {errors?.depositDate ? (
              <em id="depositDate-error" className="text-d-p-xs text-red-600">
                {errors.depositDate}
              </em>
            ) : null}
          </div>
          <input
            id="depositDate"
            name="depositDate"
            type="date"
            className={`${inputClasses} h-[34px]`}
            required
            aria-invalid={Boolean(errors?.depositDate) || undefined}
            aria-errormessage={
              errors?.depositDate ? "depositDate-error" : undefined
            }
          />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:col-span-2 lg:flex">
          <div className="flex-1">
            <LabelText>
              <label htmlFor="depositNote">Note</label>
            </LabelText>
            <input
              id="depositNote"
              name="note"
              type="text"
              className={inputClasses}
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className={submitButtonClasses}
              name="intent"
              value="create-deposit"
            >
              Create
            </button>
          </div>
        </div>
      </newDepositFetcher.Form>
    </div>
  );
}

const width = 400;
const height = 200;
const margin = { top: 10, right: 10, bottom: 30, left: 10 };

function DepositsLineChart({ deposits }: DepositsProps) {
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

  return (
    <svg
      viewBox={`0 0 ${width + margin.left + margin.right} ${
        height + margin.top + margin.bottom
      }`}
      className="min-w-[250px]"
    >
      <g transform={`translate(${margin.left},${margin.top})`}>
        <AxisText
          x={xScale(firstEntry.x)}
          y={yScale(firstEntry.y)}
          textAnchor="start"
        >
          {format.amount.format(firstEntry.y)}
        </AxisText>
        <AxisText
          x={xScale(lastEntry.x)}
          y={yScale(lastEntry.y)}
          alignmentBaseline="hanging"
          textAnchor="end"
        >
          {format.amount.format(lastEntry.y)}
        </AxisText>

        <path
          className="stroke-3 fill-transparent stroke-blue-300 stroke-[3px] md:stroke-2 xl:stroke-1"
          d={dPath}
        />
      </g>
    </svg>
  );
}

function LineItemContainer({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "flex justify-between border-t border-gray-100 py-4 text-[14px] leading-[24px]",
        className
      )}
    >
      {children}
    </div>
  );
}

function AxisText({ className, ...props }: React.SVGProps<SVGTextElement>) {
  return (
    <text
      className={clsx(
        "fill-gray-600 text-d-p-lg md:text-d-p-sm xl:text-d-p-xs",
        className
      )}
      {...props}
    />
  );
}

export function CatchBoundary() {
  const caught = useCatch();
  const params = useParams();

  if (caught.status === 404) {
    return (
      <div className="p-12 text-red-500">
        No invoice found with the ID of "{params.invoiceId}"
      </div>
    );
  }

  throw new Error(`Unexpected caught response with status: ${caught.status}`);
}

export function ErrorBoundary({ error }: { error: Error }) {
  console.error(error);

  return (
    <div className="absolute inset-0 flex justify-center bg-red-100 pt-4">
      <div className="text-center text-red-brand">
        <div className="text-[14px] font-bold">Oh snap!</div>
        <div className="px-2 text-[12px]">There was a problem. Sorry.</div>
      </div>
    </div>
  );
}

// Chart utils

function calculateCumulativeDeposits(deposits: LoaderData["deposits"]) {
  const amountPerDate = new Map<Date, number>();
  for (const { amount, depositDateFormatted } of deposits) {
    const depositDate = new Date(depositDateFormatted);
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
