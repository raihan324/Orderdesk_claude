import { redirect } from "next/navigation";

// Settings is a tabbed section; land on Profile by default.
export default function SettingsIndex() {
  redirect("/settings/profile");
}
