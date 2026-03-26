import { Injectable } from "@nestjs/common";
import { CreateShopkeeperStoreDto } from "./dto/create-shopkeeper-store.dto";
import { InjectModel } from "@nestjs/mongoose/dist";
import { ShopfrontStore } from "./entities/shopkeeper-store.entity";
import { Model } from "mongoose";
import { UpdateShopkeeperStoreDto } from "./dto/update-shopkeeper-store.dto";
import slugify from "slugify/slugify";
import { Shopkeeper } from "../shopkeepers/schemas/shopkeeper.schema";
import { Product } from "../products/entities/product.entity";

@Injectable()
export class ShopkeeperStoresService {
  constructor(
    @InjectModel(ShopfrontStore.name)
    private shopkeeperStoreModel: Model<ShopfrontStore>,
    @InjectModel(Shopkeeper.name)
    private shopkeeperModel: Model<Shopkeeper>,
    @InjectModel(Product.name)
    private productModel: Model<Product>,
  ) {}

  /**
   * Single aggregated endpoint: returns storefront settings + shopkeeper info + products
   * in ONE API call instead of 3 sequential calls.
   */
  async getStorefrontBundle(slug: string) {
    // Step 1: Find store by slug
    const store = await this.findBySlug(slug) as any;
    if (!store || !store.shopkeeperId) {
      return { store: null, shopkeeper: null, products: [] };
    }

    const shopkeeperId = store.shopkeeperId.toString();

    // Step 2: Fetch shopkeeper and products IN PARALLEL
    const [shopkeeper, products] = await Promise.all([
      this.shopkeeperModel.findById(shopkeeperId).lean().exec(),
      this.productModel.find({ shopkeeperId }).lean().exec(),
    ]);

    return {
      store,
      shopkeeper,
      products: products || [],
    };
  }

  async create(createShopkeeperStoreDto: CreateShopkeeperStoreDto) {
    try {
      const shopfrontStore = new this.shopkeeperStoreModel({
        shopkeeperId: createShopkeeperStoreDto.shopkeeperId,
        slug: createShopkeeperStoreDto.slug,
        settings: {
          general: {
            storeName: createShopkeeperStoreDto.general.storeName,
            tagline: createShopkeeperStoreDto.general.tagline,
            description: createShopkeeperStoreDto.general.description ?? "",
            logo: createShopkeeperStoreDto.general.logo ?? "",
            favicon: createShopkeeperStoreDto.general.favicon ?? "",
            contactInfo: {
              phone: createShopkeeperStoreDto.general.contactInfo.phone ?? "",
              email: createShopkeeperStoreDto.general.contactInfo.email ?? "",
              address:
                createShopkeeperStoreDto.general.contactInfo.address ?? "",
              hours: createShopkeeperStoreDto.general.contactInfo.hours ?? "",
              website:
                createShopkeeperStoreDto.general.contactInfo.website ?? "",
              instagramLink:
                createShopkeeperStoreDto.general.contactInfo.instagramLink ??
                "",
              facebookLink:
                createShopkeeperStoreDto.general.contactInfo.facebookLink ?? "",
              twitterLink:
                createShopkeeperStoreDto.general.contactInfo.twitterLink ?? "",
              tiktokLink:
                createShopkeeperStoreDto.general.contactInfo.tiktokLink ?? "",
              showInstagram:
                createShopkeeperStoreDto.general.contactInfo.showInstagram ??
                false,
              showFacebook:
                createShopkeeperStoreDto.general.contactInfo.showFacebook ??
                false,
              showTwitter:
                createShopkeeperStoreDto.general.contactInfo.showTwitter ??
                false,
              showTiktok:
                createShopkeeperStoreDto.general.contactInfo.showTiktok ??
                false,
            },
          },
          design: {
            theme: createShopkeeperStoreDto.design.theme,
            primaryColor: createShopkeeperStoreDto.design.primaryColor,
            secondaryColor: createShopkeeperStoreDto.design.secondaryColor,
            fontFamily: createShopkeeperStoreDto.design.fontFamily,
            layout: {
              header: createShopkeeperStoreDto.design.layout.header,
              allProducts: createShopkeeperStoreDto.design.layout.allProducts,
              visibleFeaturedProducts:
                createShopkeeperStoreDto.design.layout.visibleFeaturedProducts,
              visibleAdvertismentBar:
                createShopkeeperStoreDto.design.layout.visibleAdvertismentBar,
              visibleProductCarausel:
                createShopkeeperStoreDto.design.layout.visibleProductCarausel,
              advertiseText:
                createShopkeeperStoreDto.design.layout.advertiseText ?? "",
              adBarBgcolor:
                createShopkeeperStoreDto.design.layout.adBarBgcolor ?? "",
              adBarTextColor:
                createShopkeeperStoreDto.design.layout.adBarTextColor ?? "",
              visibleQuickPicks:
                createShopkeeperStoreDto.design.layout.visibleQuickPicks,
              featuredProducts:
                createShopkeeperStoreDto.design.layout.featuredProducts,
              quickPicks: createShopkeeperStoreDto.design.layout.quickPicks,
              banner: createShopkeeperStoreDto.design.layout.banner,
              footer: createShopkeeperStoreDto.design.layout.footer,
            },
            bannerImage: createShopkeeperStoreDto.design.bannerImage ?? "",
            showBanner: createShopkeeperStoreDto.design.showBanner,
            heroBannerImage:
              createShopkeeperStoreDto.design.heroBannerImage ?? "",
            bannerHeight: createShopkeeperStoreDto.design.bannerHeight,
          },
          features: {
            showSearch: createShopkeeperStoreDto.features.showSearch,
            showFilters: createShopkeeperStoreDto.features.showFilters,
            showReviews: createShopkeeperStoreDto.features.showReviews,
            showWishlist: createShopkeeperStoreDto.features.showWishlist,
            showSocialMedia: createShopkeeperStoreDto.features.showSocialMedia,
            enableChat: createShopkeeperStoreDto.features.enableChat,
            showNewsletter: createShopkeeperStoreDto.features.showNewsletter,
          },
          seo: {
            metaTitle: createShopkeeperStoreDto.seo.metaTitle,
            metaDescription: createShopkeeperStoreDto.seo.metaDescription ?? "",
            keywords: createShopkeeperStoreDto.seo.keywords ?? "",
            customCode: createShopkeeperStoreDto.seo.customCode ?? "",
          },
        },
      });

      const result = await shopfrontStore.save();

      return {
        message: "Shopfront settings created successfully",
        data: result,
      };
    } catch (error) {
      throw error;
    }
  }

  findAll() {
    return `This action returns all shopkeeperStores`;
  }

  async findOneByShopName(shopName: string) {
    try {
      const shopfrontStore = await this.shopkeeperStoreModel.findOne({
        "settings.general.storeName": shopName,
      }).lean();
      if (!shopfrontStore) {
        return { message: "Shopfront store not found", data: null };
      }
      return { message: "Shopfront store found", data: shopfrontStore };
    } catch (error) {
      throw error;
    }
  }

  async findBySlug(slug: string) {
    try {
      // Try to find by slug first (fast indexed lookup)
      let store = await this.shopkeeperStoreModel
        .findOne({ slug: slug })
        .lean()
        .exec();

      if (store) {
        return store;
      }

      // Fallback: fetch only storeName and slug fields to find matching store
      const allStores = await this.shopkeeperStoreModel
        .find({}, { _id: 1, slug: 1, "settings.general.storeName": 1 })
        .lean()
        .exec();

      let matchedId: string | null = null;
      for (const s of allStores) {
        try {
          const genSlug = slugify(s.settings?.general?.storeName || "", {
            lower: true,
            strict: true,
          });

          if (genSlug === slug) {
            matchedId = s._id.toString();
            // Save slug for faster future lookup
            await this.shopkeeperStoreModel.updateOne(
              { _id: s._id },
              { $set: { slug: genSlug } },
            );
            break;
          }
        } catch (genSlugError) {
          // slug generation failed for this store, skip
        }
      }

      if (matchedId) {
        return await this.shopkeeperStoreModel.findById(matchedId).lean().exec();
      }

      return { message: "Shopfront store found" };
    } catch (error) {
      return null;
    }
  }

  async findOneByShopkeeperId(shopkeeperId: string) {
    try {
      const shopfrontStore = await this.shopkeeperStoreModel
        .findOne({ shopkeeperId })
        .lean()
        .exec();
      if (!shopfrontStore) {
        return { message: "Shopfront store not found", data: null };
      }
      return { message: "Shopfront store found", data: shopfrontStore };
    } catch (error) {
      throw error;
    }
  }

  async update(
    shopkeeperId: string,
    updateShopkeeperDto: UpdateShopkeeperStoreDto,
    bannerImagePath?: string,
    heroBannerImagePath?: string,
  ) {
    try {
      const existingStore = await this.shopkeeperStoreModel
        .findOne({ shopkeeperId })
        .exec();

      if (!existingStore) {
        return {
          message: "Shopfront store not found",
          data: null,
        };
      }

      const updateData: any = {};

      // Update slug if provided
      if (typeof updateShopkeeperDto.slug === "string") {
        updateData.slug = updateShopkeeperDto.slug.toLowerCase();
      }

      // Update general settings if provided
      if (updateShopkeeperDto.general) {
        updateData["settings.general"] = {
          storeName:
            updateShopkeeperDto.general.storeName ??
            existingStore.settings.general.storeName,
          tagline:
            updateShopkeeperDto.general.tagline ??
            existingStore.settings.general.tagline,
          description:
            updateShopkeeperDto.general.description ??
            existingStore.settings.general.description,
          logo:
            updateShopkeeperDto.general.logo ??
            existingStore.settings.general.logo,
          favicon:
            updateShopkeeperDto.general.favicon ??
            existingStore.settings.general.favicon,
          contactInfo: {
            phone:
              updateShopkeeperDto.general.contactInfo?.phone ??
              existingStore.settings.general.contactInfo.phone,
            email:
              updateShopkeeperDto.general.contactInfo?.email ??
              existingStore.settings.general.contactInfo.email,
            address:
              updateShopkeeperDto.general.contactInfo?.address ??
              existingStore.settings.general.contactInfo.address,
            hours:
              updateShopkeeperDto.general.contactInfo?.hours ??
              existingStore.settings.general.contactInfo.hours,
            website:
              updateShopkeeperDto.general.contactInfo?.website ??
              existingStore.settings.general.contactInfo.website,
            instagramLink:
              updateShopkeeperDto.general.contactInfo?.instagramLink ??
              existingStore.settings.general.contactInfo.instagramLink,
            facebookLink:
              updateShopkeeperDto.general.contactInfo?.facebookLink ??
              existingStore.settings.general.contactInfo.facebookLink,
            twitterLink:
              updateShopkeeperDto.general.contactInfo?.twitterLink ??
              existingStore.settings.general.contactInfo.twitterLink,
            tiktokLink:
              updateShopkeeperDto.general.contactInfo?.tiktokLink ??
              existingStore.settings.general.contactInfo.tiktokLink,
            showInstagram:
              updateShopkeeperDto.general.contactInfo?.showInstagram ??
              existingStore.settings.general.contactInfo.showInstagram,
            showFacebook:
              updateShopkeeperDto.general.contactInfo?.showFacebook ??
              existingStore.settings.general.contactInfo.showFacebook,
            showTwitter:
              updateShopkeeperDto.general.contactInfo?.showTwitter ??
              existingStore.settings.general.contactInfo.showTwitter,
            showTiktok:
              updateShopkeeperDto.general.contactInfo?.showTiktok ??
              existingStore.settings.general.contactInfo.showTiktok,
          },
        };
      }

      // Update design settings if provided
      if (updateShopkeeperDto.design) {
        updateData["settings.design"] = {
          theme:
            updateShopkeeperDto.design.theme ??
            existingStore.settings.design.theme,
          primaryColor:
            updateShopkeeperDto.design.primaryColor ??
            existingStore.settings.design.primaryColor,
          secondaryColor:
            updateShopkeeperDto.design.secondaryColor ??
            existingStore.settings.design.secondaryColor,
          fontFamily:
            updateShopkeeperDto.design.fontFamily ??
            existingStore.settings.design.fontFamily,
          layout:
            updateShopkeeperDto.design.layout ??
            existingStore.settings.design.layout,
          heroBannerImage:
            heroBannerImagePath ??
            updateShopkeeperDto.design.heroBannerImage ??
            existingStore.settings.design.heroBannerImage,
          bannerImage:
            bannerImagePath ??
            updateShopkeeperDto.design.bannerImage ??
            existingStore.settings.design.bannerImage,
          showBanner:
            updateShopkeeperDto.design.showBanner ??
            existingStore.settings.design.showBanner,
          bannerHeight:
            updateShopkeeperDto.design.bannerHeight ??
            existingStore.settings.design.bannerHeight,
        };
      }

      // Update features settings if provided
      if (updateShopkeeperDto.features) {
        updateData["settings.features"] = {
          showSearch:
            updateShopkeeperDto.features.showSearch ??
            existingStore.settings.features.showSearch,
          showFilters:
            updateShopkeeperDto.features.showFilters ??
            existingStore.settings.features.showFilters,
          showReviews:
            updateShopkeeperDto.features.showReviews ??
            existingStore.settings.features.showReviews,
          showWishlist:
            updateShopkeeperDto.features.showWishlist ??
            existingStore.settings.features.showWishlist,
          showSocialMedia:
            updateShopkeeperDto.features.showSocialMedia ??
            existingStore.settings.features.showSocialMedia,
          enableChat:
            updateShopkeeperDto.features.enableChat ??
            existingStore.settings.features.enableChat,
          showNewsletter:
            updateShopkeeperDto.features.showNewsletter ??
            existingStore.settings.features.showNewsletter,
        };
      }

      // Update SEO settings if provided
      if (updateShopkeeperDto.seo) {
        updateData["settings.seo"] = {
          metaTitle:
            updateShopkeeperDto.seo.metaTitle ??
            existingStore.settings.seo.metaTitle,
          metaDescription:
            updateShopkeeperDto.seo.metaDescription ??
            existingStore.settings.seo.metaDescription,
          keywords:
            updateShopkeeperDto.seo.keywords ??
            existingStore.settings.seo.keywords,
          customCode:
            updateShopkeeperDto.seo.customCode ??
            existingStore.settings.seo.customCode,
        };
      }

      // Perform the update
      const updatedStore = await this.shopkeeperStoreModel
        .findOneAndUpdate(
          { shopkeeperId },
          { $set: updateData },
          { new: true, runValidators: true },
        )
        .exec();

      return {
        message: "Shopfront store updated successfully",
        data: updatedStore,
      };
    } catch (error) {
      throw error;
    }
  }

  remove(id: number) {
    return `This action removes a #${id} shopkeeperStore`;
  }
}
