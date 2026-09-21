import { gql } from "graphql-request"
import type { StrapiSEO, StrapiSocialMeta } from "./seo"

export type HomePageData = {
  home: {
    Sections: any[]
    SEO?: StrapiSEO
    SocialMeta?: StrapiSocialMeta
  }
}

export const GetHomePageQuery = gql`
  query HomePageQuery {
    home {
      SEO {
        metaTitle
        metaDescription
        keywords
        canonicalUrl
      }
      SocialMeta {
        ogTitle
        ogDescription
        ogImage {
          url
        }
        ogImageAlt
        ogType
        twitterCard
        twitterTitle
        twitterDescription
        twitterImage {
          url
        }
        twitterImageAlt
        twitterCreator
        twitterSite
      }
      Sections {
        __typename
        ... on ComponentHomeHero {
          HeroTitle: Title
          BackgroundImage {
            url
          }
          CTAButton {
            Text
            Url
          }
        }
        ... on ComponentHomeBestsellers {
          BestsellersTitle: Title
          Products {
            id
            Title
            Slug
            Price
            Image {
              url
            }
            Description
          }
        }
        ... on ComponentHomeKosherPromise {
          TopLogo {
            url
          }
          KosherPromiseTitle: Title
          Content
          BadgeImage {
            url
          }
          FeatureText
          FeatureImage {
            url
          }
          Link {
            Text
            Url
          }
        }
        ... on ComponentHomeShopCollections {
          CollectionsTitle: Title
          Collections {
            id
            Title
            Slug
            Image {
              url
            }
          }
        }
        ... on ComponentHomeFollowUs {
          FollowUsTitle: Title
          Description
          SmallImages {
            url
          }
          BigImage {
            url
          }
        }
        ... on ComponentHomeBlogExplore {
          CategoryLabel
          BlogExploreTitle: Title
          Button {
            Text
          }
          QuoteDecorImage {
            url
          }
          MainImage {
            url
          }
        }
      }
    }
  }
`
