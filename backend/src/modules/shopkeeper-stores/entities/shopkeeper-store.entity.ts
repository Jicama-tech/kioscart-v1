import * as mongoose from "mongoose";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";
import slugify from "slugify";

export interface ContactInfo {
  phone?: string;
  email?: string;
  address?: string;
  hours?: string;
  website?: string;
  showInstagram: boolean;
  showFacebook: boolean;
  showTwitter: boolean;
  showTiktok: boolean;
  instagramLink: string;
  facebookLink: string;
  twitterLink: string;
  tiktokLink: string;
}

export interface StorefrontSettings {
  general: {
    storeName: string;
    tagline: string;
    description?: string;
    aboutUs?: string;
    logo?: string;
    favicon?: string;
    contactInfo: ContactInfo;
  };
  design: {
    theme: string;
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
    layout: {
      header: string;
      allProducts: string;
      visibleFeaturedProducts: boolean;
      visibleAdvertismentBar: boolean;
      visibleProductCarausel: boolean;
      advertiseText: string;
      adBarBgcolor: string;
      adBarTextColor: string;
      adBarPosition: string;
      visibleQuickPicks: boolean;
      featuredProducts: string;
      quickPicks: string;
      quickPicksProducts: string[];
      banner: string;
      bannerTextAlign: string;
      footer: string;
      headerFontSize: number;
      headerFontColor: string;
      headerBgColor: string;
      headerBold: boolean;
      headerNavPosition: string;
      bannerType: string;
      bannerImages: string[];
      bannerFontSize: number;
      bannerFontColor: string;
      bannerBold: boolean;
      productCardStyle: string;
      sectionOrder: string[];
      showHistoryBox: boolean;
      historyContent: string;
      showInstagramBar: boolean;
      instagramReelUrls: string[];
      showVideoSection: boolean;
      videoUrl: string;
      showOurStory: boolean;
      ourStoryTitle: string;
      ourStoryDescription: string;
      ourStoryMedia: { type: "image" | "video"; url: string; thumbnail?: string }[];
      featuredProductTitle: string;
      featuredProductDescription: string;
      ourProductsTitle: string;
      ourProductsDescription: string;
      ourStoryEyebrow: string;
      quickPicksTitle: string;
      quickPicksDescription: string;
      allProductsTitle: string;
      allProductsDescription: string;
      instagramTitle: string;
      instagramDescription: string;
      videoSectionTitle: string;
      videoSectionDescription: string;
      newsletterTitle: string;
      newsletterDescription: string;
      featuredProductTitleColor: string;
      featuredProductDescColor: string;
      ourProductsTitleColor: string;
      ourProductsDescColor: string;
      quickPicksTitleColor: string;
      quickPicksDescColor: string;
      allProductsTitleColor: string;
      allProductsDescColor: string;
      instagramTitleColor: string;
      instagramDescColor: string;
      videoSectionTitleColor: string;
      videoSectionDescColor: string;
      newsletterTitleColor: string;
      newsletterDescColor: string;
      ourStoryEyebrowColor: string;
      ourStoryTitleColor: string;
      ourStoryDescColor: string;
      showFeedbackBar: boolean;
      showDarkMode: boolean;
      // Section titles styling
      sectionFontSize: number;
      sectionFontColor: string;
      sectionBold: boolean;
      // Product card styling
      cardNameFontSize: number;
      cardNameColor: string;
      cardPriceColor: string;
      cardDescColor: string;
      // Footer styling
      footerBgColor: string;
      footerTextColor: string;
      footerFontSize: number;
    };
    heroBannerImage?: string;
    bannerImage?: string;
    showBanner: boolean;
    bannerHeight: string;
  };
  features: {
    showSearch: boolean;
    showFilters: boolean;
    showReviews: boolean;
    showWishlist: boolean;
    showQuickView?: boolean;
    showSocialMedia: boolean;
    enableChat: boolean;
    showNewsletter: boolean;
  };
  feedbacks?: { name: string; rating: number; text: string; date: string }[];
  seo: {
    metaTitle: string;
    metaDescription?: string;
    keywords?: string;
    customCode?: string;
  };
}

export type ShopkeeperStoreDocument = ShopfrontStore & Document;

@Schema({ timestamps: true, collection: "shopkeeper_stores" })
export class ShopfrontStore {
  @Prop({
    type: Types.ObjectId,
    ref: "Shopkeeper",
    required: true,
    unique: true,
  })
  shopkeeperId: Types.ObjectId;

  @Prop({
    type: String,
    unique: true,
    index: true,
    required: true,
  })
  slug: string; // slug field for URL

  @Prop({
    type: Object,
    required: true,
    default: {
      general: {
        storeName: "EventFlow Shop",
        tagline: "Premium artisanal products crafted.",
        description: "",
        logo: "",
        favicon: "",
        contactInfo: {
          phone: "",
          email: "",
          address: "",
          hours: "",
          website: "",
          showInstagram: false,
          showFacebook: false,
          showTwitter: false,
          showTiktok: false,
          instagramLink: "",
          facebookLink: "",
          twitterLink: "",
          tiktokLink: "",
        },
      },
      design: {
        theme: "light",
        primaryColor: "#6366f1",
        secondaryColor: "#8b5cf6",
        fontFamily: "Inter",
        layout: {
          header: "modern",
          allProducts: "single",
          visibleFeaturedProducts: false,
          visibleAdvertismentBar: false,
          advertismentBar: "modern",
          advertiseText: "Welcome to Advertisement Bar",
          adBarPosition: "top",
          visibleQuickPicks: false,
          featuredProducts: "modern",
          quickPicks: "modern",
          quickPicksProducts: [],
          banner: "modern",
          bannerTextAlign: "left",
          visibleProductCarausel: false,
          footer: "modern",
          headerFontSize: 16,
          headerFontColor: "#000000",
          headerBgColor: "#ffffff",
          headerBold: false,
          headerNavPosition: "left",
          bannerType: "single",
          bannerImages: [],
          bannerFontSize: 24,
          bannerFontColor: "#ffffff",
          bannerBold: false,
          productCardStyle: "default",
          sectionOrder: ["featured", "quickPicks", "allProducts"],
          showHistoryBox: false,
          historyContent: "",
          showInstagramBar: false,
          instagramReelUrls: [],
          showVideoSection: false,
          videoUrl: "",
          showOurStory: false,
          ourStoryTitle: "",
          ourStoryDescription: "",
          ourStoryMedia: [],
          featuredProductTitle: "Featured Product",
          featuredProductDescription: "Our newest addition",
          ourProductsTitle: "Our Products",
          ourProductsDescription: "Browse through our collection",
          ourStoryEyebrow: "How we started",
          quickPicksTitle: "Quick Picks",
          quickPicksDescription: "Handpicked products just for you",
          allProductsTitle: "All Products",
          allProductsDescription: "Handpicked products just for you",
          instagramTitle: "Follow Us on Instagram",
          instagramDescription: "Check out our latest reels and posts",
          videoSectionTitle: "",
          videoSectionDescription: "Get a behind-the-scenes look at what makes us special",
          newsletterTitle: "Stay Updated",
          newsletterDescription: "Subscribe to our newsletter for latest updates and offers",
          featuredProductTitleColor: "",
          featuredProductDescColor: "",
          ourProductsTitleColor: "",
          ourProductsDescColor: "",
          quickPicksTitleColor: "",
          quickPicksDescColor: "",
          allProductsTitleColor: "",
          allProductsDescColor: "",
          instagramTitleColor: "",
          instagramDescColor: "",
          videoSectionTitleColor: "",
          videoSectionDescColor: "",
          newsletterTitleColor: "",
          newsletterDescColor: "",
          ourStoryEyebrowColor: "",
          ourStoryTitleColor: "",
          ourStoryDescColor: "",
          showFeedbackBar: false,
          showDarkMode: false,
          sectionFontSize: 28,
          sectionFontColor: "#0f172a",
          sectionBold: true,
          cardNameFontSize: 16,
          cardNameColor: "#0f172a",
          cardPriceColor: "#16a34a",
          cardDescColor: "#64748b",
          footerBgColor: "#f8fafc",
          footerTextColor: "#0f172a",
          footerFontSize: 14,
        },
        bannerImage: "",
        showBanner: true,
        bannerHeight: "large",
      },
      features: {
        showSearch: true,
        showFilters: true,
        showReviews: true,
        showWishlist: true,
        showSocialMedia: true,
        enableChat: false,
        showNewsletter: true,
      },
      seo: {
        metaTitle: "EventFlow Shop - Premium Storefront",
        metaDescription: "",
        keywords: "",
        customCode: "",
      },
    },
  })
  settings: StorefrontSettings;
}

export const ShopfrontStoreSchema =
  SchemaFactory.createForClass(ShopfrontStore);

// Add pre-save hook to generate slug before saving
ShopfrontStoreSchema.pre<ShopkeeperStoreDocument>("save", function (next) {
  if (this.isModified("settings.general.storeName") || !this.slug) {
    this.slug = slugify(this.settings.general.storeName, {
      lower: true,
      strict: true,
    });
  }
  next();
});
