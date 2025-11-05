import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Upload, Download, Plus } from "lucide-react";

export default function Homepage() {
  return (
    <div className="mx-8">
      {/* Page Header */}
      <div className="my-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground text-base">
            Create new projects or open existing projects
          </p>
        </div>
      </div>

      {/* Create New Project Card */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Create New Project</CardTitle>
          <CardDescription>
            Select two PBF files to start a new merge project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            {/* Source File Upload */}
            <div className="flex flex-col">
              <div className="flex flex-col items-center justify-center gap-6 rounded-xl border-2 border-dashed border-border px-6 py-14 h-full">
                <Upload className="h-10 w-10 text-muted-foreground" />
                <div className="flex max-w-[480px] flex-col items-center gap-1 text-center">
                  <p className="text-lg font-semibold">源文件 (Source)</p>
                  <p className="text-sm text-muted-foreground">
                    拖放 PBF 文件至此，或点击选择
                  </p>
                </div>
                <Button variant="secondary" size="lg">
                  选择文件
                </Button>
              </div>
            </div>

            {/* Target File Upload */}
            <div className="flex flex-col">
              <div className="flex flex-col items-center justify-center gap-6 rounded-xl border-2 border-dashed border-border px-6 py-14 h-full">
                <Download className="h-10 w-10 text-muted-foreground" />
                <div className="flex max-w-[480px] flex-col items-center gap-1 text-center">
                  <p className="text-lg font-semibold">目标文件 (Target)</p>
                  <p className="text-sm text-muted-foreground">
                    拖放 PBF 文件至此，或点击选择
                  </p>
                </div>
                <Button variant="secondary" size="lg">
                  选择文件
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button size="lg" className="w-full md:w-auto min-w-[180px]">
            <Plus className="h-4 w-4" />
            创建项目
          </Button>
        </CardFooter>
      </Card>

      {/* Existing Projects Section */}
      <div className="mt-10">
        <h2 className="text-2xl font-semibold tracking-tight mb-4">
          Recent Projects
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Project Card 1 */}
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>项目: EU-West-Merge</ItemTitle>
              <ItemDescription>上次修改: 2023-10-26</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button variant="outline" size="sm">
                打开
              </Button>
            </ItemActions>
          </Item>

          {/* Project Card 2 */}
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>项目: Asia-Data-Sync</ItemTitle>
              <ItemDescription>上次修改: 2023-10-22</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button variant="outline" size="sm">
                打开
              </Button>
            </ItemActions>
          </Item>

          {/* Project Card 3 */}
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>项目: US-Region-Update</ItemTitle>
              <ItemDescription>上次修改: 2023-09-15</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button variant="outline" size="sm">
                打开
              </Button>
            </ItemActions>
          </Item>
        </div>
      </div>
    </div>
  );
}
