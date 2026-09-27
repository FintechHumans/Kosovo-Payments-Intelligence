# -*- coding: utf-8 -*-
"""Merchant verticals, and the bridge from customs tariff codes to them.

A vertical is a kind of merchant a card could be presented at. The point of
naming them is that the sources disagree about everything else: ATK publishes
NACE sections, ASK publishes its own groupings, customs publishes tariff codes.
None of those is a merchant category. The vertical is the common key, and every
source reaches it through its own explicit map rather than by matching names.

TWO THINGS THIS MAP REFUSES TO DO.

It does not treat every import as consumer demand. Most of what Kosovo imports
by value is not merchant stock at all: fuel in bulk, steel, industrial
machinery, plastics in primary form. Those carry `consumer_facing=False` and are
excluded from every merchant-facing figure rather than quietly inflating it.

And it does not read a tariff chapter as a vertical where the chapter mixes
uses. Chapter 84 holds both excavators and laptops; chapter 85 holds both
power transformers and mobile phones. Those are resolved at four digits, and
anything in an ambiguous chapter that no heading rule claims stays
unclassified rather than being assigned to the chapter's most likely vertical.
"""

VERTICAL_MAPPING_VERSION = 'v1.0'

# addressability: how plausibly the vertical settles on a card at a terminal.
# It is a judgement, recorded with its reason, not a measurement.
VERTICALS = [
    dict(id='grocery_food',   name='Grocery & Food Retail', addressability='HIGH',
         rationale='Everyday retail, high transaction frequency, small tickets.'),
    dict(id='fashion',        name='Fashion & Footwear', addressability='HIGH',
         rationale='Discretionary retail, card-led in most markets.'),
    dict(id='beauty',         name='Beauty & Cosmetics', addressability='HIGH',
         rationale='Specialist retail with frequent repeat purchase.'),
    dict(id='electronics',    name='Consumer Electronics', addressability='HIGH',
         rationale='Large tickets, strongly card-led.'),
    dict(id='mobile_telecom', name='Mobile Phones & Telecom', addressability='HIGH',
         rationale='Handset retail and airtime, card-led.'),
    dict(id='computers_it',   name='Computers & IT', addressability='HIGH',
         rationale='Large tickets, business and consumer.'),
    dict(id='home_appliance', name='Home Appliances', addressability='HIGH',
         rationale='Large tickets, often financed.'),
    dict(id='furniture_home', name='Furniture & Home', addressability='HIGH',
         rationale='Large tickets, showroom retail.'),
    dict(id='construction',   name='Construction Retail', addressability='MEDIUM',
         rationale='Mixed trade and retail; much of it settles between businesses.'),
    dict(id='tiles_sanitary', name='Tiles & Sanitary', addressability='MEDIUM',
         rationale='Showroom retail, but a large share is contractor trade.'),
    dict(id='automotive',     name='Automotive Dealers', addressability='MEDIUM',
         rationale='Very large tickets; vehicle purchase often settles by transfer.'),
    dict(id='auto_parts',     name='Auto Parts & Tyres', addressability='HIGH',
         rationale='Workshop and counter retail, card-suitable tickets.'),
    dict(id='fuel_mobility',  name='Fuel & Mobility', addressability='HIGH',
         rationale='Forecourt retail, card-led — but bulk fuel import is not retail.'),
    dict(id='pharmacy',       name='Pharmacy & Health Products', addressability='HIGH',
         rationale='Frequent small tickets.'),
    dict(id='healthcare',     name='Private Healthcare & Dental', addressability='MEDIUM',
         rationale='Service vertical; imports here are equipment, not stock.'),
    dict(id='hospitality',    name='Hospitality & Food Service', addressability='HIGH',
         rationale='Restaurants, cafes and hotels.'),
    dict(id='leisure_sport',  name='Leisure, Sport & Toys', addressability='HIGH',
         rationale='Discretionary retail.'),
    # Deliberately not a merchant vertical. Everything that is imported as
    # industrial input, capital equipment or bulk commodity lands here and is
    # excluded from merchant-facing figures.
    dict(id='not_consumer',   name='Not consumer-facing', addressability='LOW',
         rationale='Industrial inputs, capital goods and bulk commodities. '
                   'Imported value that no merchant sells across a counter.'),
]

CONSUMER_FACING = {v['id'] for v in VERTICALS} - {'not_consumer'}
VERTICAL_NAME = {v['id']: v['name'] for v in VERTICALS}

# Verticals whose IMPORT value is dominated by bulk rather than by merchant
# stock. Fuel is sold across a forecourt on a card, but what crosses the border
# is tanker cargo priced on a world market, so its import line moves with the
# oil price as much as with demand. It is kept as a vertical and excluded from
# the headline, and the headline says which it is.
BULK_DOMINATED = {'fuel_mobility'}

# ---------------------------------------------------------------- HS chapters
# Two-digit chapter -> vertical, used only where the whole chapter shares one
# commercial use. Ambiguous chapters are absent and resolved at four digits.
CHAPTER = {
    # food and drink
    '01': 'grocery_food', '02': 'grocery_food', '03': 'grocery_food',
    '04': 'grocery_food', '07': 'grocery_food', '08': 'grocery_food',
    '09': 'grocery_food', '10': 'grocery_food', '11': 'grocery_food',
    '15': 'grocery_food', '16': 'grocery_food', '17': 'grocery_food',
    '18': 'grocery_food', '19': 'grocery_food', '20': 'grocery_food',
    '21': 'grocery_food', '22': 'grocery_food', '24': 'grocery_food',
    # clothing and footwear
    '61': 'fashion', '62': 'fashion', '64': 'fashion', '65': 'fashion',
    '42': 'fashion',
    # beauty
    '33': 'beauty',
    # pharmacy
    '30': 'pharmacy',
    # furniture and lighting
    '94': 'furniture_home',
    # construction materials
    '25': 'construction', '68': 'construction', '72': 'construction',
    '73': 'construction', '76': 'construction',
    # tiles and sanitary ware
    '69': 'tiles_sanitary',
    # leisure
    '95': 'leisure_sport',
    # bulk and industrial: named explicitly so the exclusion is a decision
    '27': 'not_consumer',   # mineral fuels, overwhelmingly bulk import
    '28': 'not_consumer', '29': 'not_consumer', '31': 'not_consumer',
    '38': 'not_consumer', '39': 'not_consumer', '40': 'not_consumer',
    '47': 'not_consumer', '48': 'not_consumer', '52': 'not_consumer',
    '54': 'not_consumer', '55': 'not_consumer', '78': 'not_consumer',
    '79': 'not_consumer', '81': 'not_consumer', '86': 'not_consumer',
    '89': 'not_consumer',
}

# ------------------------------------------------------------- HS headings
# Four-digit heading -> vertical. These win over the chapter rule, and they are
# the only way chapters 84, 85, 87 and 90 are read at all.
HEADING = {
    # vehicles
    '8703': 'automotive',      # cars, including the large used-car flow
    '8704': 'automotive', '8705': 'automotive', '8711': 'automotive',
    '8716': 'automotive',
    '8708': 'auto_parts', '8707': 'auto_parts', '8714': 'auto_parts',
    '4011': 'auto_parts',      # new pneumatic tyres
    '4013': 'auto_parts',
    '8507': 'auto_parts',      # accumulators
    '2710': 'fuel_mobility',   # refined petroleum: retail forecourt plus bulk
    # home appliances
    '8415': 'home_appliance', '8418': 'home_appliance', '8422': 'home_appliance',
    '8450': 'home_appliance', '8451': 'home_appliance', '8452': 'home_appliance',
    '8508': 'home_appliance', '8509': 'home_appliance', '8510': 'home_appliance',
    '8516': 'home_appliance', '8414': 'home_appliance',
    '7321': 'home_appliance', '7323': 'home_appliance',
    # computing
    '8471': 'computers_it', '8473': 'computers_it', '8443': 'computers_it',
    # telecom
    '8517': 'mobile_telecom',
    # consumer electronics
    '8518': 'electronics', '8519': 'electronics', '8521': 'electronics',
    '8527': 'electronics', '8528': 'electronics', '8523': 'electronics',
    '9006': 'electronics', '9101': 'electronics', '9102': 'electronics',
    # medical and dental equipment
    '9018': 'healthcare', '9019': 'healthcare', '9021': 'healthcare',
    '9022': 'healthcare',
    # eyewear
    '9003': 'healthcare', '9004': 'healthcare',
    # sport and toys
    '9503': 'leisure_sport', '9504': 'leisure_sport', '9506': 'leisure_sport',
}

# Chapters that mix uses so thoroughly that no chapter-level default is
# defensible. Codes in these chapters that no heading rule claims are returned
# unclassified, and the build reports how much value that leaves out.
AMBIGUOUS_CHAPTERS = {'84', '85', '87', '90', '91', '96', '70', '32', '34',
                      '44', '49', '63', '66', '67', '71', '82', '83'}


# ------------------------------------------------- ASK retail trade activities
# ASK publishes eight retail activities as an index. They discriminate between
# verticals in a way ATK's sections do not, but an index carries no level, so
# this map supplies momentum and never size.
ASK_RETAIL = {
    'dyqane jo t':          'grocery_food',      # non-specialised stores
    'produkteve ushqimore': 'grocery_food',
    'karburantit':          'fuel_mobility',
    'informatike':          'computers_it',
    'pajisjeve t':          'home_appliance',
    'kulturore':            'leisure_sport',
    # 'mallrave të tjerë' covers fashion, beauty, pharmacy and more in one
    # line, and 'tezga' is market stalls. Neither resolves to a vertical, so
    # neither is mapped.
}

# --------------------------------------------------------------- ATK sections
# ATK publishes NACE sections. Only a few are a vertical on their own; the rest
# of the consumer economy sits inside one wholesale-and-retail section worth
# about half of all declared turnover.
ATK_SECTION = {
    'Accommodation & Food':   'hospitality',
    'Human Health':           'healthcare',
}

# Every vertical whose turnover is buried inside ATK's combined trade section.
# ATK cannot size any of them individually, and the report says so rather than
# apportioning the section by a guess.
ATK_SHARED_SECTION = 'Wholesale & Retail Trade'
ATK_SHARED_VERTICALS = {
    'grocery_food', 'fashion', 'beauty', 'electronics', 'mobile_telecom',
    'computers_it', 'home_appliance', 'furniture_home', 'construction',
    'tiles_sanitary', 'automotive', 'auto_parts', 'fuel_mobility', 'pharmacy',
}


def ask_retail_vertical(activity_name):
    low = (activity_name or '').lower()
    for needle, vid in ASK_RETAIL.items():
        if needle.lower() in low:
            return vid
    return None


def atk_section_vertical(sector_name):
    """-> (vertical_id, 'exclusive'|'shared'|None)

    'shared' means the section exists but covers many verticals at once, so it
    can describe the section and not the vertical.
    """
    s = sector_name or ''
    for needle, vid in ATK_SECTION.items():
        if needle.lower() in s.lower():
            return vid, 'exclusive'
    if ATK_SHARED_SECTION.lower() in s.lower():
        return None, 'shared'
    return None, None


def classify(tariff_code):
    """-> (vertical_id or None, how) for a customs tariff code.

    `how` records which rule fired, so a figure can be traced to the reason it
    was counted: 'heading', 'chapter', 'ambiguous' or 'unmapped'.
    """
    s = ''.join(ch for ch in str(tariff_code or '') if ch.isdigit())
    if len(s) < 4:
        return None, 'unmapped'
    head, chap = s[:4], s[:2]
    if head in HEADING:
        return HEADING[head], 'heading'
    if chap in AMBIGUOUS_CHAPTERS:
        return None, 'ambiguous'
    if chap in CHAPTER:
        return CHAPTER[chap], 'chapter'
    return None, 'unmapped'


def is_consumer_facing(vertical_id):
    return vertical_id in CONSUMER_FACING
