import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Res,
  Header,
  UploadedFile,
  UseInterceptors,
  UploadedFiles,
  ForbiddenException,
} from "@nestjs/common";
import { ShopkeeperStoresService } from "./shopkeeper-stores.service";
import { CreateShopkeeperStoreDto } from "./dto/create-shopkeeper-store.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthGuard } from "@nestjs/passport";
import { SubscriptionGuard } from "../../common/subscription/subscription.guard";
import { RequiresFeature } from "../../common/subscription/requires-feature.decorator";
import { UpdateShopkeeperStoreDto } from "./dto/update-shopkeeper-store.dto";
import { diskStorage } from "multer";
import * as path from "path";
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from "@nestjs/platform-express";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";

// Ensure uploads directory exists
const ensureDirectoryExists = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Multer storage configuration for banner uploads
const storage = diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "./uploads/banners";
    ensureDirectoryExists(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `banner-${uniqueSuffix}${ext}`);
  },
});

/**
 * Guards are per-route, never on the controller: the storefront reads below
 * (bundle by slug, detail by shop name, detail by shopkeeper id) are what the
 * live customer-facing shop and the checkout pages fetch with no token at all,
 * so requiring a JWT on this class would take every storefront offline.
 *
 * The two writes are the theme builder saving settings. They are sold per plan
 * (see the "storefront" group in frontend/src/lib/planModules.ts) and until now
 * were enforced only in the dashboard UI, so a shop on a plan without the theme
 * builder could still save a themed storefront by calling the API directly.
 */
@Controller("shopkeeper-stores")
export class ShopkeeperStoresController {
  constructor(
    private readonly shopkeeperStoresService: ShopkeeperStoresService,
  ) {}

  /**
   * The JWT `sub` (mapped to `userId` by JwtStrategy) is the owning shopkeeper.
   * Operator-minted tokens carry the parent owner's id, so an operator passes
   * their owner's checks without a special case.
   */
  private callerId(req: any): string {
    const id = String(req?.user?.userId || "");
    if (!id) throw new ForbiddenException("Not your account");
    return id;
  }

  @Post("add-store-settings")
  @UseGuards(AuthGuard("jwt"), SubscriptionGuard)
  @RequiresFeature("storefront")
  create(
    @Req() req: any,
    @Body() createShopkeeperStoreDto: CreateShopkeeperStoreDto,
  ) {
    try {
      // The shop to create settings for arrives in the body, so it was a
      // free choice of the caller. The dashboard already sends the token's
      // own `sub` here, so pinning it to the token changes nothing for the
      // real client and closes the cross-shop write.
      const shopkeeperId = this.callerId(req);
      if (
        createShopkeeperStoreDto.shopkeeperId &&
        String(createShopkeeperStoreDto.shopkeeperId) !== shopkeeperId
      ) {
        throw new ForbiddenException("Not your store");
      }
      createShopkeeperStoreDto.shopkeeperId = shopkeeperId;

      console.log(createShopkeeperStoreDto, "createShopkeeperStoreDto");
      return this.shopkeeperStoresService.create(createShopkeeperStoreDto);
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  @Get()
  findAll() {
    return this.shopkeeperStoresService.findAll();
  }

  @Get("shopkeeper-store-detail")
  @UseGuards(AuthGuard("jwt"))
  findOne(@Req() req: any) {
    try {
      const id = req.user.userId;
      return this.shopkeeperStoresService.findOneByShopkeeperId(id);
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  @Get("shopkeeper-store-detail/:id")
  async findById(@Param("id") id: string) {
    try {
      return await this.shopkeeperStoresService.findOneByShopkeeperId(id);
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  @Get("shopkeeper-stores-detail/:shopName")
  findOneById(@Param("shopName") shopName: string) {
    try {
      return this.shopkeeperStoresService.findBySlug(shopName);
    } catch (error) {
      throw error;
    }
  }

  // Aggregated endpoint: storefront + shopkeeper + products in ONE call
  // Cache-Control allows browsers/CDNs to cache for 60s, revalidate after
  @Get("storefront-bundle/:slug")
  @Header("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
  async getStorefrontBundle(@Param("slug") slug: string) {
    return this.shopkeeperStoresService.getStorefrontBundle(slug);
  }

  @Patch("update-store-settings")
  @UseGuards(AuthGuard("jwt"), SubscriptionGuard)
  @RequiresFeature("storefront")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "bannerImage", maxCount: 1 },
        { name: "heroBannerImage", maxCount: 1 },
        { name: "bannerImages", maxCount: 5 },
        { name: "sectionVideo", maxCount: 1 },
        { name: "storyMedia", maxCount: 3 },
      ],
      {
        storage,
        fileFilter: (req, file, cb) => {
          if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
            cb(null, true);
          } else {
            cb(new Error("Only image and video files allowed"), false);
          }
        },
        limits: { fileSize: 50 * 1024 * 1024 }, // 50MB for videos
      },
    ),
  )
  async update(
    @Req() req: any,
    @UploadedFiles()
    files: {
      bannerImage?: Express.Multer.File[];
      heroBannerImage?: Express.Multer.File[];
      bannerImages?: Express.Multer.File[];
      sectionVideo?: Express.Multer.File[];
      storyMedia?: Express.Multer.File[];
    },
    @Body() updateShopkeeperStoreDto: UpdateShopkeeperStoreDto,
  ) {
    try {
      // No :shopkeeperId to check against — the row updated is chosen by the
      // token's own id, so the route can only ever write the caller's store.
      const id = this.callerId(req);

      console.log("Received body:", updateShopkeeperStoreDto);
      console.log("Received files:", files);

      // Parse JSON string fields from multipart body
      Object.keys(updateShopkeeperStoreDto).forEach((key) => {
        if (typeof updateShopkeeperStoreDto[key] === "string") {
          try {
            const parsed = JSON.parse(updateShopkeeperStoreDto[key]);
            (updateShopkeeperStoreDto as any)[key] = parsed;
          } catch (parseError) {
            console.log(`Could not parse ${key}:`, parseError);
            // Keep the original value if parsing fails
          }
        }
      });

      // Handle bannerImage (0 or 1 file)
      let bannerImagePath: string | undefined;
      if (files.bannerImage && files.bannerImage.length > 0) {
        bannerImagePath = `/uploads/banners/${files.bannerImage[0].filename}`;
        console.log("Banner image path:", bannerImagePath);
      }

      // Handle heroBannerImage (0 or 1 file)
      let heroBannerImagePath: string | undefined;
      if (files.heroBannerImage && files.heroBannerImage.length > 0) {
        heroBannerImagePath = `/uploads/banners/${files.heroBannerImage[0].filename}`;
        console.log("Hero banner image path:", heroBannerImagePath);
      }

      // Handle bannerImages (multiple files for carousel)
      let bannerImagesPaths: string[] | undefined;
      if (files.bannerImages && files.bannerImages.length > 0) {
        bannerImagesPaths = files.bannerImages.map(
          (f) => `/uploads/banners/${f.filename}`,
        );
        console.log("Banner images paths:", bannerImagesPaths);
      }

      // Handle sectionVideo upload
      let sectionVideoPath: string | undefined;
      if (files.sectionVideo && files.sectionVideo.length > 0) {
        sectionVideoPath = `/uploads/banners/${files.sectionVideo[0].filename}`;
      }

      // Handle storyMedia uploads
      let storyMediaPaths: string[] | undefined;
      if (files.storyMedia && files.storyMedia.length > 0) {
        storyMediaPaths = files.storyMedia.map(
          (f) => `/uploads/banners/${f.filename}`,
        );
      }

      return await this.shopkeeperStoresService.update(
        id,
        updateShopkeeperStoreDto,
        bannerImagePath,
        heroBannerImagePath,
        bannerImagesPaths,
        sectionVideoPath,
        storyMediaPaths,
      );
    } catch (error) {
      console.log("Update error:", error);
      throw error;
    }
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.shopkeeperStoresService.remove(+id);
  }
}
