import { Link } from "@remix-run/react";
import type { LoaderFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireUser } from "~/session.server";

export const loader: LoaderFunction = async ({ request }) => {
  await requireUser(request);
  // redirect so we don't have to manually go to the page we're demoing every time we log in
  throw redirect("sales/invoices/");
};

export default function IndexRoute() {
  return (
    <div>
      Go to the{" "}
      <Link className="text-blue-600 underline" to="sales">
        sales
      </Link>{" "}
      page...
    </div>
  );
}
