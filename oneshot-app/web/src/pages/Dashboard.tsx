import {
  Activity,
  CreditCard,
  DollarSign,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  MousePointer2,
} from "lucide-react";
import { useAuth } from "../auth";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "../components/Card";
import { Avatar, AvatarFallback, AvatarImage } from "../components/Avatar";
import { Button } from "../components/Button";

export function Dashboard() {
  const { user } = useAuth();

  const stats = [
    {
      title: "Total Revenue",
      value: "$45,231.89",
      change: "+20.1% from last month",
      icon: DollarSign,
    },
    {
      title: "Subscriptions",
      value: "+2350",
      change: "+180.1% from last month",
      icon: Users,
    },
    {
      title: "Sales",
      value: "+12,234",
      change: "+19% from last month",
      icon: CreditCard,
    },
    {
      title: "Active Now",
      value: "+573",
      change: "+201 since last hour",
      icon: Activity,
    },
  ];

  const recentSales = [
    {
      name: "Olivia Martin",
      email: "olivia.martin@email.com",
      amount: "+$1,999.00",
      avatar: "https://ui.shadcn.com/avatars/01.png",
      initials: "OM",
    },
    {
      name: "Jackson Lee",
      email: "jackson.lee@email.com",
      amount: "+$39.00",
      avatar: "https://ui.shadcn.com/avatars/02.png",
      initials: "JL",
    },
    {
      name: "Isabella Nguyen",
      email: "isabella.nguyen@email.com",
      amount: "+$299.00",
      avatar: "https://ui.shadcn.com/avatars/03.png",
      initials: "IN",
    },
    {
      name: "William Kim",
      email: "will@email.com",
      amount: "+$99.00",
      avatar: "https://ui.shadcn.com/avatars/04.png",
      initials: "WK",
    },
    {
      name: "Sofia Davis",
      email: "sofia.davis@email.com",
      amount: "+$39.00",
      avatar: "https://ui.shadcn.com/avatars/05.png",
      initials: "SD",
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1
            className="text-3xl font-bold tracking-tight"
            data-testid="dashboard-heading"
          >
            Dashboard
          </h1>
          <p className="text-text-muted mt-1">
            Overview for <span className="font-semibold text-text">{user?.id}</span>.
          </p>
        </div>
        <div className="flex gap-2">
          <Button>Download Report</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-text-muted" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-text-muted">{stat.change}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>
              Your application's monthly recurring revenue.
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[350px] flex items-end justify-between gap-2 px-4 pb-4 pt-10">
              {/* Mock Chart Bars */}
              {[45, 23, 78, 56, 34, 89, 45, 67, 23, 89, 45, 76].map(
                (height, i) => (
                  <div key={i} className="w-full flex flex-col gap-2 group">
                    <div className="relative flex-1 w-full bg-surface-alt rounded-t-sm overflow-hidden">
                      <div
                        className="absolute bottom-0 w-full bg-primary transition-all duration-500 group-hover:bg-primary-hover"
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-center text-text-muted uppercase">
                      {new Date(0, i).toLocaleString("default", {
                        month: "short",
                      })}
                    </span>
                  </div>
                ),
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
            <CardDescription>
              You made 265 sales this month.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {recentSales.map((sale, i) => (
                <div key={i} className="flex items-center">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={sale.avatar} alt="Avatar" />
                    <AvatarFallback>{sale.initials}</AvatarFallback>
                  </Avatar>
                  <div className="ml-4 space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {sale.name}
                    </p>
                    <p className="text-xs text-text-muted">{sale.email}</p>
                  </div>
                  <div className="ml-auto font-medium">{sale.amount}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>User Acquisition</CardTitle>
            <CardDescription>New users over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center p-4 bg-primary/10 rounded-full mb-2">
                  <ArrowUpRight className="w-6 h-6 text-primary" />
                </div>
                <div className="text-3xl font-bold">+12.5%</div>
                <p className="text-xs text-text-muted">vs last 30 days</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bounce Rate</CardTitle>
            <CardDescription>Users leaving quickly</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center p-4 bg-success/10 rounded-full mb-2">
                  <ArrowDownRight className="w-6 h-6 text-success" />
                </div>
                <div className="text-3xl font-bold">-2.4%</div>
                <p className="text-xs text-text-muted">vs last 30 days</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Click Through Rate</CardTitle>
            <CardDescription>Ad performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center p-4 bg-primary/10 rounded-full mb-2">
                  <MousePointer2 className="w-6 h-6 text-primary" />
                </div>
                <div className="text-3xl font-bold">4.3%</div>
                <p className="text-xs text-text-muted">avg. per campaign</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
