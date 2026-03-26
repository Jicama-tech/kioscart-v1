import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Store, UserPlus, Star } from "lucide-react";

interface Shopkeeper {
  id: string;
  name: string;
  shopName: string;
  description: string;
  products?: number;
  followers?: string;
  rating?: number;
  isFollowing?: boolean;
  categories?: string[];
}

interface DiscoverSectionProps {
  onFollowShopkeeper: (shopkeeperId: string) => void;
}

export function DiscoverSection({ onFollowShopkeeper }: DiscoverSectionProps) {
  const [shopkeepers, setShopkeepers] = useState<Shopkeeper[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const apiURL = __API_URL__;

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`${apiURL}/shopkeepers/get-all-shopkeepers`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch shopkeepers: ${res.statusText}`);
        }
        return res.json();
      })
      .then((data) => {
        setShopkeepers(data.data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || "Unexpected error");
        setLoading(false);
      });
  }, [apiURL]);

  const categories = [
    "All",
    "Food",
    "Fashion",
    "Electronics",
    "Sports",
    "Art",
    "Technology",
    "Music",
  ];

  const filteredShopkeepers = shopkeepers.filter(
    (shopkeeper) =>
      shopkeeper.shopName.toLowerCase().includes(searchQuery.toLowerCase()) &&
      (selectedCategory === "All" ||
        (shopkeeper.categories?.includes(selectedCategory) ?? true))
  );

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-xl font-semibold">Discover & Follow Stores</h3>

        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search stores..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Categories */}
        <div className="flex gap-2 flex-wrap">
          {categories.map((category) => (
            <Badge
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </Badge>
          ))}
        </div>
      </div>

      {loading && <p>Loading stores…</p>}
      {error && <p className="text-red-600">Error: {error}</p>}
      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredShopkeepers.length === 0 && (
            <p className="text-muted-foreground col-span-2">No stores found.</p>
          )}
          {filteredShopkeepers.map((shopkeeper) => (
            <Card
              key={shopkeeper.id}
              className="hover:shadow-md transition-shadow"
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Store className="h-4 w-4 text-primary" />
                      {shopkeeper.shopName}
                    </CardTitle>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Owner: {shopkeeper.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{shopkeeper.products ?? 0} products</span>
                      <span>{shopkeeper.followers ?? "0"} followers</span>
                      <div className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        <span>{shopkeeper.rating ?? 0}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant={shopkeeper.isFollowing ? "outline" : "default"}
                    size="sm"
                    onClick={() => onFollowShopkeeper(shopkeeper.id)}
                    className={
                      shopkeeper.isFollowing
                        ? "text-red-600 hover:text-red-700 hover:bg-red-50"
                        : ""
                    }
                  >
                    <UserPlus className="h-4 w-4 mr-1" />
                    {shopkeeper.isFollowing ? "Unfollow" : "Follow"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-3">
                  {shopkeeper.description}
                </CardDescription>
                <div className="flex gap-1 flex-wrap">
                  {(shopkeeper.categories || []).map((category) => (
                    <Badge key={category} variant="secondary" className="text-xs">
                      {category}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
