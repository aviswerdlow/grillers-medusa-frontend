import { gql } from "graphql-request"

export type NavItem = {
  Text: string
  Url: string
}

export type NavSection = {
  title: string
  Url?: string
  items: NavItem[]
}

export type NavFeatured = {
  title: string
  description: string
  badge: string
  url?: string
  image?: {
    url: string
  }
}

export type NavCertification = {
  icon: string
  text: string
}

export type NavBottomBar = {
  certifications: NavCertification[]
  viewAllText: string
  viewAllUrl: string
}

export type HeaderNavLink = {
  id: string
  slug: string
  title: string
  sections: NavSection[]
  featured: NavFeatured
  bottomBar: NavBottomBar
}

export const HeaderNavQuery = gql`
  query HeaderNav {
    header {
      PhoneNumber
      PhoneLabel
      HeaderNav {
        id
        slug
        title
        sections {
          title
          items {
            Text
            Url
          }
        }
        featured {
          title
          description
          badge
          image {
            url
          }
        }
        bottomBar {
          certifications {
            icon
            text
          }
          viewAllText
          viewAllUrl
        }
      }
    }
  }
`
