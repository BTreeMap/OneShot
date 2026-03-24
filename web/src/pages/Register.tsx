import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/Card";
import { Alert } from "../components/Alert";

export function Register() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md shadow-lg border-primary/10">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">
            Registration Disabled
          </CardTitle>
          <CardDescription>
            Public account creation is not available in OneShot mode.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <Alert variant="error">
            Public registration is disabled. Please contact an administrator for
            a secure upload link.
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
