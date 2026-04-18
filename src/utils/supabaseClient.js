import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kwfhfpkqfwusahrsqvms.supabase.co' // <-- pega aquí
const supabaseKey = 'kwfhfpkqfwusahrsqvms' // <-- pega aquí

export const supabase = createClient(supabaseUrl, supabaseKey)